// Lo que el portal le pide al CMS en nombre de un visitante: entrar, opinar, guardar
// un favorito. Solo de servidor — cada llamada lleva el secreto que el CMS exige
// (CMS_PORTAL_SECRET, "CityGuide:PortalApiSecret" allá), y ese secreto es lo único
// que le permite al CMS fiarse del miembro que el portal nombra.
//
// Las lecturas públicas (la valoración de cada lugar, sus opiniones) se cachean con
// la etiqueta "reviews", que las acciones que escriben descartan al momento
// (`updateTag`) y el CMS descarta cuando un editor oculta una opinión o bloquea a
// alguien (`/api/revalidate?tag=reviews`). Lo que es de un visitante no se cachea.

import type { Locale } from "@/lib/i18n";
import type {
  OwnReview,
  PlaceReviews,
  SiteRating,
} from "@/lib/reviews";

const BASE_URL = process.env.UMBRACO_BASE_URL ?? "http://localhost:54509";
export const REVIEWS_TAG = "reviews";
const REVALIDATE_SECONDS = 600;

type Result<T> = { ok: true; data: T } | { ok: false; error?: string; status: number };

async function call(
  path: string,
  init: RequestInit = {},
  forwardedFor?: string | null,
): Promise<Response | null> {
  const secret = process.env.CMS_PORTAL_SECRET;
  if (!secret) return null;
  try {
    return await fetch(`${BASE_URL}/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-portal-secret": secret,
        ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
      },
    });
  } catch {
    return null;
  }
}

/** A write or a personal read: the CMS's complaint comes back for the visitor to read. */
async function send<T>(
  path: string,
  init: RequestInit,
  forwardedFor?: string | null,
): Promise<Result<T>> {
  const response = await call(path, { ...init, cache: "no-store" }, forwardedFor);
  if (!response) return { ok: false, status: 503 };
  const body = await response.json().catch(() => null);
  return response.ok
    ? { ok: true, data: body as T }
    : { ok: false, status: response.status, error: body?.error };
}

const cached: RequestInit = {
  next: { revalidate: REVALIDATE_SECONDS, tags: [REVIEWS_TAG] },
};

/** La valoración del portal de cada lugar que tiene opiniones, por clave de nodo. */
export async function getSiteRatings(): Promise<Record<string, SiteRating>> {
  const response = await call("/reviews/summaries", cached);
  if (!response?.ok) return {};
  return response.json();
}

export async function getSiteRating(placeId: string): Promise<SiteRating | null> {
  return (await getSiteRatings())[placeId] ?? null;
}

export async function getPlaceReviews(placeId: string): Promise<PlaceReviews> {
  const response = await call(`/reviews/${placeId}`, cached);
  if (!response?.ok) return { summary: null, reviews: [] };
  return response.json();
}

/** La opinión propia del visitante y si guardó el lugar. */
export async function getPlaceAccount(
  placeId: string,
  memberKey: string,
): Promise<{ mine: OwnReview | null; favorite: boolean }> {
  const result = await send<{ mine: OwnReview | null; favorite: boolean }>(
    `/reviews/${placeId}?member=${encodeURIComponent(memberKey)}`,
    { method: "GET" },
  );
  return result.ok ? result.data : { mine: null, favorite: false };
}

export function saveReview(
  placeId: string,
  memberKey: string,
  rating: number,
  comment: string,
  locale: Locale,
): Promise<Result<OwnReview>> {
  return send(`/reviews/${placeId}`, {
    method: "PUT",
    body: JSON.stringify({ member: memberKey, rating, comment, locale }),
  });
}

export function deleteReview(placeId: string, memberKey: string): Promise<Result<unknown>> {
  return send(`/reviews/${placeId}?member=${encodeURIComponent(memberKey)}`, {
    method: "DELETE",
  });
}

export function setFavorite(
  memberKey: string,
  placeId: string,
  favorite: boolean,
): Promise<Result<{ favorite: boolean }>> {
  return send(`/account/${memberKey}/favorites/${placeId}`, {
    method: favorite ? "PUT" : "DELETE",
  });
}

/** Los lugares que el visitante guardó, del más reciente al más antiguo. */
export async function getFavorites(memberKey: string): Promise<string[]> {
  const result = await send<string[]>(`/account/${memberKey}/favorites`, { method: "GET" });
  return result.ok ? result.data : [];
}

export interface Member {
  key: string;
  name: string;
}

/** Google ya probó el correo: el CMS encuentra al miembro o lo crea. */
export function signInMember(
  email: string,
  name: string,
  locale: Locale,
): Promise<Result<Member>> {
  return send("/account/sign-in", {
    method: "POST",
    body: JSON.stringify({ email, name, locale }),
  });
}

/** Pide al CMS que envíe el enlace de acceso; `link` es la página que lo canjea. */
export function sendLoginLink(
  email: string,
  name: string,
  link: string,
  locale: Locale,
  forwardedFor: string | null,
): Promise<Result<unknown>> {
  return send(
    "/account/login-link",
    { method: "POST", body: JSON.stringify({ email, name, link, locale }) },
    forwardedFor,
  );
}

export function redeemLoginLink(token: string, locale: Locale): Promise<Result<Member>> {
  return send("/account/login-link/redeem", {
    method: "POST",
    body: JSON.stringify({ token, locale }),
  });
}
