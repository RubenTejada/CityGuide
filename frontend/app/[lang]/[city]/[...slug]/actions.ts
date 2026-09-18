"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, t } from "@/lib/i18n";
import { todayInDR } from "@/lib/cinema";
import {
  REVIEWS_TAG,
  deleteReview as deleteReviewInCms,
  saveReview as saveReviewInCms,
  setFavorite,
} from "@/lib/portalApi";
import {
  MAX_COMMENT,
  MAX_RATING,
  MIN_RATING,
  type ReviewState,
} from "@/lib/reviews";
import { getSession } from "@/lib/session";
import {
  MAX_NOTES,
  MAX_PARTY,
  type ReservationState,
} from "@/lib/reservation";

const BASE_URL = process.env.UMBRACO_BASE_URL ?? "http://localhost:54509";

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Files a reservation request in the CMS (`/api/reservation` in CityGuideWeb), which
 * sends it on to the establishment and acknowledges it to the visitor by email. Nothing
 * is booked here: the portal takes the request and the venue confirms it, which is what
 * the form says.
 *
 * Server-side like the contact form, for the same two reasons — the CMS never has to be
 * reachable from the browser, and the form works before hydration. The visitor's address
 * is forwarded because the hop through this server would otherwise make every request
 * look like one sender to the endpoint's rate limit.
 */
export async function requestReservation(
  _prev: ReservationState,
  data: FormData,
): Promise<ReservationState> {
  // A Server Action has no route to read the language from; the form states it.
  const submitted = field(data, "locale");
  const locale = isLocale(submitted) ? submitted : DEFAULT_LOCALE;
  const words = t(locale).reservation.errors;

  const placeId = field(data, "placeId");
  const date = field(data, "date");
  const time = field(data, "time");
  const partySize = Number.parseInt(field(data, "partySize"), 10);
  const name = field(data, "name");
  const email = field(data, "email");
  const phone = field(data, "phone");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { status: "error", error: words.date };
  }
  // The day is compared in the city's own clock; the CMS checks the hour too, since
  // only it knows how far into today the request is.
  if (date < todayInDR()) {
    return { status: "error", error: words.past };
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > MAX_PARTY) {
    return { status: "error", error: words.party(MAX_PARTY) };
  }
  if (name.length < 2) return { status: "error", error: words.name };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", error: words.email };
  }
  if (phone.replace(/\D/g, "").length < 7) {
    return { status: "error", error: words.phone };
  }

  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");

  try {
    const response = await fetch(`${BASE_URL}/api/reservation`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(forwarded ? { "X-Forwarded-For": forwarded } : {}),
      },
      body: JSON.stringify({
        placeId,
        placeUrl: field(data, "placeUrl"),
        date,
        time,
        partySize,
        name,
        email,
        phone,
        notes: field(data, "notes").slice(0, MAX_NOTES),
        locale,
        website: field(data, "website"),
      }),
    });

    if (response.status === 429) {
      return { status: "error", error: words.tooMany };
    }
    if (!response.ok) {
      // The endpoint answers with the complaint the visitor can act on (a time
      // already past, a place that stopped taking reservations).
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      return { status: "error", error: body?.error || words.failed };
    }
  } catch {
    return { status: "error", error: words.failed };
  }

  return { status: "sent", summary: { date, time, partySize } };
}

/**
 * Publica o reemplaza la opinión del visitante sobre un lugar. La sesión dice quién
 * es — nunca el formulario —, y el CMS vuelve a comprobar que el miembro no esté
 * bloqueado y que el lugar admita opiniones. `updateTag` descarta al momento las
 * opiniones y valoraciones en caché, así que la ficha que se recarga ya la muestra.
 */
export async function saveReview(
  _prev: ReviewState,
  data: FormData,
): Promise<ReviewState> {
  const submitted = field(data, "locale");
  const locale = isLocale(submitted) ? submitted : DEFAULT_LOCALE;
  const words = t(locale).reviews.errors;
  const session = await getSession();
  if (!session) return { status: "error", error: words.signIn };

  const rating = Number.parseInt(field(data, "rating"), 10);
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    return { status: "error", error: words.rating };
  }

  const result = await saveReviewInCms(
    field(data, "placeId"),
    session.memberKey,
    rating,
    field(data, "comment").slice(0, MAX_COMMENT),
    locale,
  );
  if (!result.ok) {
    return {
      status: "error",
      error: result.status === 403 ? words.signIn : result.error || words.failed,
    };
  }

  updateTag(REVIEWS_TAG);
  return { status: "saved", mine: result.data };
}

export async function deleteReview(
  placeId: string,
  locale: string,
): Promise<ReviewState> {
  const words = t(isLocale(locale) ? locale : DEFAULT_LOCALE).reviews.errors;
  const session = await getSession();
  if (!session) return { status: "error", error: words.signIn };
  const result = await deleteReviewInCms(placeId, session.memberKey);
  if (!result.ok) return { status: "error", error: words.failed };
  updateTag(REVIEWS_TAG);
  return { status: "deleted", mine: null };
}

/** Guarda o quita un lugar de los favoritos del visitante. Devuelve cómo quedó. */
export async function toggleFavorite(
  placeId: string,
  favorite: boolean,
): Promise<{ favorite: boolean } | null> {
  const session = await getSession();
  if (!session) return null;
  const result = await setFavorite(session.memberKey, placeId, favorite);
  return result.ok ? result.data : null;
}
