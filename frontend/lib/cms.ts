// Reads from the Umbraco Content Delivery API v2. Server-only: every fetch is
// cached with ISR and asks for the language the page being rendered is in.

import {
  CULTURE,
  DEFAULT_LOCALE,
  isLocale,
  otherLocale,
  type Locale,
} from "@/lib/i18n";
import type { UmbracoItem } from "@/lib/umbraco";

export type { MediaItem, UmbracoItem } from "@/lib/umbraco";

const BASE_URL = process.env.UMBRACO_BASE_URL ?? "http://localhost:54509";
export const REVALIDATE_SECONDS = 600;

interface UmbracoList {
  total: number;
  items: UmbracoItem[];
}

/**
 * The language the page being rendered is in. Every fetch below takes it as an
 * optional last argument and, left out, reads it from the route: the language is the
 * root segment of every page, so a Server Component anywhere in the tree gets it
 * without threading it through fifty call sites. The argument is there for the two
 * callers that have no route to read — the sitemap, which wants both languages, and
 * the search-index route handler, where `next/root-params` cannot be called.
 *
 * Exported because the deeper Server Components read it the same way, rather than
 * taking the language as one more prop through every view in the catch-all page.
 */
export async function activeLocale(locale?: Locale): Promise<Locale> {
  if (locale) return locale;
  // Imported where it is used, not at the top: `next/root-params` only exists in
  // Server Components, and a static import would follow this module into the client
  // bundle of every card that reads a CMS item.
  const { lang } = await import("next/root-params");
  const segment = await lang();
  return segment && isLocale(segment) ? segment : DEFAULT_LOCALE;
}

interface UmbracoList {
  total: number;
  items: UmbracoItem[];
}

async function api(path: string, locale?: Locale): Promise<Response> {
  const culture = CULTURE[await activeLocale(locale)];
  return fetch(`${BASE_URL}/umbraco/delivery/api/v2${path}`, {
    // The culture decides which language's text and route paths come back, and it
    // is part of the request, so each language caches separately.
    headers: { "Accept-Language": culture },
    // Tagged so /api/revalidate (called by an Umbraco webhook on publish/
    // unpublish/delete) can drop every CMS response at once; the time-based
    // revalidate stays as a fallback.
    next: { revalidate: REVALIDATE_SECONDS, tags: ["umbraco"] },
  });
}

/**
 * Fetch a single content item by its route path (e.g. "/santo-domingo/restaurantes").
 * `expand` asks the Delivery API to fill in the properties of the content a picker
 * references ("properties[establishments]"); without it those come back as bare
 * name-and-route stubs.
 */
export async function getItem(
  path: string,
  expand?: string,
  locale?: Locale,
): Promise<UmbracoItem | null> {
  const res = await api(
    `/content/item${path.startsWith("/") ? path : `/${path}`}` +
      (expand ? `?expand=${encodeURIComponent(expand)}` : ""),
    locale,
  );
  if (!res.ok) return null;
  return res.json();
}

/**
 * Fetch direct children of a content item, ordered by sortOrder. `contentType`
 * narrows them where the children are of several kinds and only one is wanted:
 * a section holds its subcategories beside hundreds of places, and without the
 * filter the page of children comes back full of places.
 */
export async function getChildren(
  path: string,
  take = 100,
  locale?: Locale,
  contentType?: string,
): Promise<UmbracoItem[]> {
  const res = await api(
    `/content?fetch=${encodeURIComponent(`children:${path}`)}&sort=sortOrder:asc&take=${take}` +
      (contentType
        ? `&filter=${encodeURIComponent(`contentType:${contentType}`)}`
        : ""),
    locale,
  );
  if (!res.ok) return [];
  const data: UmbracoList = await res.json();
  return data.items;
}

/**
 * Every descendant of a content item of one type, paged through the Delivery
 * API — `max` is a ceiling for the callers that only want the first few (the
 * city front page's four events), not the size of one request. Paging is what
 * the rest need: a single `take` silently returned the first slice and nothing
 * said so, which left the restaurants of Santo Domingo listing 363 of 994, its
 * count, its filters, its map and its ItemList all agreeing on the wrong
 * number, and the search index blind to the same places.
 */
export async function getDescendantsOfType(
  path: string,
  contentType: string,
  max = 5000,
  locale?: Locale,
): Promise<UmbracoItem[]> {
  const query =
    `/content?fetch=${encodeURIComponent(`descendants:${path}`)}` +
    `&filter=${encodeURIComponent(`contentType:${contentType}`)}`;
  const pageSize = 500;
  const items: UmbracoItem[] = [];
  while (items.length < max) {
    const take = Math.min(pageSize, max - items.length);
    const res = await api(`${query}&skip=${items.length}&take=${take}`, locale);
    if (!res.ok) break;
    const data: UmbracoList = await res.json();
    items.push(...data.items);
    if (data.items.length === 0 || items.length >= data.total) break;
  }
  return items;
}

/**
 * Every descendant of a content item, whatever its type, paged through the
 * Delivery API. Used by the sitemap, which must cover content types nobody
 * enumerated explicitly.
 */
export async function getDescendants(
  path: string,
  max = 5000,
  locale?: Locale,
): Promise<UmbracoItem[]> {
  const pageSize = 100;
  const items: UmbracoItem[] = [];
  for (let skip = 0; skip < max; skip += pageSize) {
    const res = await api(
      `/content?fetch=${encodeURIComponent(`descendants:${path}`)}&skip=${skip}&take=${pageSize}`,
      locale,
    );
    if (!res.ok) break;
    const data: UmbracoList = await res.json();
    items.push(...data.items);
    if (items.length >= data.total || data.items.length === 0) break;
  }
  return items;
}

/** All cities in the portal (children of the site root). */
export async function getCities(locale?: Locale): Promise<UmbracoItem[]> {
  const res = await api(
    `/content?filter=${encodeURIComponent("contentType:city")}&take=50`,
    locale,
  );
  if (!res.ok) return [];
  const data: UmbracoList = await res.json();
  return data.items;
}

/**
 * The same content in the other language, or null when nobody has translated it. A
 * node keeps one id across cultures, so the counterpart is looked up by id rather
 * than by path — the path is exactly what differs, since the segments are translated
 * too ("/santo-domingo/restaurantes/china" and "/en/santo-domingo/restaurants/chinese").
 *
 * A page only declares an hreflang pair when this answers: pointing at a URL that
 * 404s makes Google drop both sides of the pair.
 */
export async function alternateOf(
  item: UmbracoItem,
  locale: Locale,
): Promise<{ locale: Locale; path: string } | null> {
  const other = otherLocale(locale);
  const res = await api(`/content/item/${item.id}`, other);
  if (!res.ok) return null;
  const translated: UmbracoItem = await res.json();
  return translated.route?.path
    ? { locale: other, path: translated.route.path }
    : null;
}
