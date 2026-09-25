// Lo que el portal le pide al CMS en nombre de un visitante: entrar, opinar, guardar
// un favorito. Solo de servidor — cada llamada lleva el secreto que el CMS exige
// (CMS_PORTAL_SECRET, "CityGuide:PortalApiSecret" allá), y ese secreto es lo único
// que le permite al CMS fiarse del miembro que el portal nombra.
//
// Las lecturas públicas (la valoración de cada lugar, sus opiniones) se cachean con
// la etiqueta "reviews", que las acciones que escriben descartan al momento
// (`updateTag`) y el CMS descarta cuando un editor oculta una opinión o bloquea a
// alguien (`/api/revalidate?tag=reviews`). Lo que es de un visitante no se cachea.

import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "@/lib/i18n";
import type {
  OwnReview,
  PlaceReviews,
  SiteRating,
} from "@/lib/reviews";

const BASE_URL = process.env.UMBRACO_BASE_URL ?? "http://localhost:54509";
export const REVIEWS_TAG = "reviews";

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

/**
 * Una lectura pública, cacheada con la etiqueta "reviews": lo que las páginas
 * muestran a todos. Null cuando el CMS no respondió, que se guarda solo el medio
 * minuto de `unanswered`; lo demás, los diez minutos de `cms` o hasta que una
 * escritura descarte la etiqueta.
 */
async function readPublic<T>(path: string): Promise<T | null> {
  "use cache";
  cacheTag(REVIEWS_TAG);
  const response = await call(path);
  const body = response?.ok ? ((await response.json()) as T) : null;
  if (body === null) cacheLife("unanswered");
  else cacheLife("cms");
  return body;
}

/** La valoración del portal de cada lugar que tiene opiniones, por clave de nodo. */
export async function getSiteRatings(): Promise<Record<string, SiteRating>> {
  return (await readPublic<Record<string, SiteRating>>("/reviews/summaries")) ?? {};
}

export async function getSiteRating(placeId: string): Promise<SiteRating | null> {
  return (await getSiteRatings())[placeId] ?? null;
}

export async function getPlaceReviews(placeId: string): Promise<PlaceReviews> {
  return (
    (await readPublic<PlaceReviews>(`/reviews/${placeId}`)) ?? {
      summary: null,
      reviews: [],
    }
  );
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

/** Todo lo que el portal guarda del miembro, para que se lo lleve (derecho de acceso). */
export function exportMember(memberKey: string): Promise<Result<unknown>> {
  return send(`/account/${memberKey}/export`, { method: "GET" });
}

/** Borra al miembro a petición suya; sus opiniones y favoritos se van con él. */
export function deleteMember(memberKey: string): Promise<Result<unknown>> {
  return send(`/account/${memberKey}`, { method: "DELETE" });
}
