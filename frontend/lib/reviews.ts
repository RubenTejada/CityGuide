// Opiniones y favoritos de los visitantes: lo que el navegador y el servidor
// acuerdan sobre ellos. Puro y utilizable en el navegador, como lib/reservation.ts —
// las llamadas al CMS viven en lib/portalApi.ts, que es solo de servidor.
//
// La valoración del portal va siempre al lado de la de Google y nunca mezclada con
// ella: son dos públicos distintos, y un promedio de los dos no diría nada de ninguno.

import type { UmbracoItem } from "@/lib/umbraco";

export const MIN_RATING = 1;
export const MAX_RATING = 5;
/** Lo que cabe en una opinión; el CMS corta en el mismo número. */
export const MAX_COMMENT = 2000;

/** Los tipos de documento que se pueden valorar y guardar: un establecimiento. */
export const RATEABLE_TYPES = new Set(["place", "mall"]);

export function isRateable(item: UmbracoItem): boolean {
  return RATEABLE_TYPES.has(item.contentType);
}

/** La valoración de los visitantes del portal: la media y cuántas opiniones hay. */
export interface SiteRating {
  average: number;
  count: number;
}

export interface Review {
  id: number;
  author: string;
  rating: number;
  comment: string | null;
  /** ISO, UTC. */
  createdUtc: string;
  updatedUtc: string;
}

/** La opinión propia, que además dice si un editor la ocultó. */
export interface OwnReview {
  rating: number;
  comment: string | null;
  updatedUtc: string;
  hidden: boolean;
}

export interface PlaceReviews {
  summary: SiteRating | null;
  reviews: Review[];
}

/** Quién está dentro, tal como lo ve el navegador: nada más que el nombre. */
export interface AccountUser {
  name: string;
}

/** Con qué se puede entrar en esta instalación. */
export interface AuthProviders {
  google: boolean;
  email: boolean;
}

/** Lo que `/api/me` responde. */
export interface AccountState {
  user: AccountUser | null;
  providers: AuthProviders;
}

/** Lo que `/api/me/place/[id]` responde: el punto de partida de los controles de una ficha. */
export interface PlaceAccountState extends AccountState {
  mine: OwnReview | null;
  favorite: boolean;
}

export interface ReviewState {
  status: "idle" | "saved" | "deleted" | "error";
  error?: string;
  mine?: OwnReview | null;
}

/**
 * A dónde volver después de entrar: una ruta del propio portal y nada más, o un enlace
 * de acceso podría mandar al visitante a cualquier sitio con la sesión recién abierta.
 */
export function safeReturnPath(value: string | null | undefined): string {
  // Sin barras invertidas, espacios ni caracteres de control en ninguna parte: el
  // navegador borra los tabuladores de una URL, y "/<tab>/otro.com" llegaría como
  // "//otro.com".
  return value && /^\/(?![/\\])[^\s\\\p{Cc}]*$/u.test(value) ? value : "/";
}
