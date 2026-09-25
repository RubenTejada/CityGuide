// Reads from the Umbraco Content Delivery API v2. Server-only: every answer is
// cached (`use cache`, tagged "umbraco") and asks for the language the page
// being rendered is in.

import { cacheLife, cacheTag } from "next/cache";
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

/**
 * The tag every Delivery API answer carries, which /api/revalidate — called by
 * the CMS on publish, unpublish, delete and move — drops all at once. It
 * reaches the pages too: a cache tag read inside a render is carried by the
 * prerendered page, so a publish expires the page along with the data.
 */
export const CMS_TAG = "umbraco";

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

/**
 * One Delivery API answer: its body, or null when there is none to give.
 *
 * Cached rather than fetched, because under Cache Components a plain `fetch` is
 * request-time data and would keep every page that reads the CMS out of the
 * prerender. The culture is an argument and not read here, so it is part of
 * the key: each language caches separately, and the route handlers that name
 * the language themselves share the entries the pages fill.
 *
 * A 404 is an answer — nothing is published at that path — and is kept as long
 * as any other. Anything else is the CMS failing, and it is kept only for the
 * half minute `unanswered` gives it: long enough not to hammer a CMS that is
 * restarting, short enough that a page rendered during the hiccup does not
 * stay broken for the ten minutes a real answer is kept.
 */
async function read<T>(path: string, culture: string): Promise<T | null> {
  "use cache";
  cacheTag(CMS_TAG);
  const res = await fetch(`${BASE_URL}/umbraco/delivery/api/v2${path}`, {
    headers: { "Accept-Language": culture },
  });
  if (res.ok) {
    cacheLife("cms");
    return (await res.json()) as T;
  }
  if (res.status === 404) cacheLife("cms");
  else cacheLife("unanswered");
  return null;
}

async function api<T>(path: string, locale?: Locale): Promise<T | null> {
  return read<T>(path, CULTURE[await activeLocale(locale)]);
}

/** The pictures a page's own item is fetched with (see getItem). */
const MEDIA_EXPAND = "properties[photo,gallery]";

/**
 * Fetch a single content item by its route path (e.g. "/santo-domingo/restaurantes").
 * `expand` asks the Delivery API to fill in the properties of the content a picker
 * references ("properties[establishments]"); without it those come back as bare
 * name-and-route stubs.
 *
 * Asked for nothing else, it expands the item's pictures: a picked media item only
 * carries its own properties — the credit of a Commons or Google photo (photoAuthor,
 * photoLicense, photoSource) — when the picker is expanded, and the detail page prints
 * that credit under the photo and in the gallery. A caller expanding another property
 * reads its pictures off the route's item, which this default already covers.
 */
export async function getItem(
  path: string,
  expand?: string,
  locale?: Locale,
): Promise<UmbracoItem | null> {
  return api<UmbracoItem>(
    `/content/item${path.startsWith("/") ? path : `/${path}`}` +
      `?expand=${encodeURIComponent(expand ?? MEDIA_EXPAND)}`,
    locale,
  );
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
  const data = await api<UmbracoList>(
    `/content?fetch=${encodeURIComponent(`children:${path}`)}&sort=sortOrder:asc&take=${take}` +
      (contentType
        ? `&filter=${encodeURIComponent(`contentType:${contentType}`)}`
        : ""),
    locale,
  );
  return data?.items ?? [];
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
    const data = await api<UmbracoList>(
      `${query}&skip=${items.length}&take=${take}`,
      locale,
    );
    if (!data) break;
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
    const data = await api<UmbracoList>(
      `/content?fetch=${encodeURIComponent(`descendants:${path}`)}&skip=${skip}&take=${pageSize}`,
      locale,
    );
    if (!data) break;
    items.push(...data.items);
    if (items.length >= data.total || data.items.length === 0) break;
  }
  return items;
}

/** All cities in the portal (children of the site root). */
export async function getCities(locale?: Locale): Promise<UmbracoItem[]> {
  const data = await api<UmbracoList>(
    `/content?filter=${encodeURIComponent("contentType:city")}&take=50`,
    locale,
  );
  return data?.items ?? [];
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
  const translated = await api<UmbracoItem>(`/content/item/${item.id}`, other);
  return translated?.route?.path
    ? { locale: other, path: translated.route.path }
    : null;
}

/**
 * Several items by id, in the order asked for; ids the Delivery API does not serve in
 * this language (unpublished, deleted, untranslated) are simply missing from the answer.
 */
export async function getItemsById(
  ids: string[],
  locale?: Locale,
): Promise<UmbracoItem[]> {
  if (ids.length === 0) return [];
  const items =
    (await api<UmbracoItem[]>(
      `/content/items?${ids.map((id) => `id=${encodeURIComponent(id)}`).join("&")}`,
      locale,
    )) ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
