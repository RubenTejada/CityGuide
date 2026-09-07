// Shape of a Umbraco Content Delivery API v2 item, and the helpers that read one.
//
// Pure and client-safe on purpose: cards, maps and badges read items in the browser,
// and pulling the fetch layer in with them would drag `next/root-params` — which only
// exists in Server Components — into the client bundle. The fetching lives in
// lib/cms.ts.

export interface MediaItem {
  url: string;
  name?: string;
}

export interface UmbracoItem {
  id: string;
  contentType: string;
  name: string;
  /** ISO timestamps; `updateDate` feeds sitemap <lastmod> and article dateModified. */
  createDate: string;
  updateDate: string;
  route: { path: string };
  properties: Record<string, unknown>;
}

// ---- property helpers ----

export function prop<T>(item: UmbracoItem, alias: string): T | undefined {
  return item.properties[alias] as T | undefined;
}

export function text(item: UmbracoItem, alias: string): string {
  return (item.properties[alias] as string | null | undefined) ?? "";
}

export function num(item: UmbracoItem, alias: string): number {
  const value = item.properties[alias];
  return typeof value === "number" ? value : 0;
}

/**
 * The content a multi-node picker on this item references, as full items. Empty
 * when the property is unset or the item was fetched without expanding it.
 */
export function picked(item: UmbracoItem, alias: string): UmbracoItem[] {
  const value = prop<UmbracoItem[]>(item, alias);
  return Array.isArray(value)
    ? value.filter((entry) => entry?.route?.path)
    : [];
}

export function facilities(item: UmbracoItem): string[] {
  const value = item.properties["facilities"];
  return Array.isArray(value) ? (value as string[]) : [];
}

/**
 * URL of the first image in a MediaPicker3 property, or null.
 * Relative CMS paths (/media/...) are kept relative: a Next.js rewrite proxies
 * them same-origin, which keeps the image optimizer happy (it refuses remote
 * fetches from local IPs since Next 16).
 */
export function photoUrl(item: UmbracoItem, alias = "photo"): string | null {
  return photoUrls(item, alias)[0] ?? null;
}

/**
 * Every image URL of a MediaPicker3 property, in the order the picker holds them.
 * "photo" is a single picture and "gallery" the several a detail page rotates, but
 * both come back from the Delivery API as a list of media items.
 */
export function photoUrls(item: UmbracoItem, alias = "gallery"): string[] {
  const value = item.properties[alias];
  if (!Array.isArray(value)) return [];
  return (value as MediaItem[])
    .map((media) => media?.url)
    .filter((url): url is string => Boolean(url));
}

/**
 * A city that is offered in the city switcher but has no content yet: its page
 * shows an "en construcción" notice instead of its sections, and it is kept out
 * of the sitemap and of search engines.
 */
export function isComingSoon(item: UmbracoItem): boolean {
  return item.properties["comingSoon"] === true;
}

/** Last non-empty segment of a route path (the item's own slug). */
export function slugOf(item: UmbracoItem): string {
  const segments = item.route.path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

/**
 * Comparator: best rated first (Google rating, then number of reviews).
 * Items without a rating score 0, so they sort last and, `Array#sort` being
 * stable, keep their relative order.
 */
export function byRating(a: UmbracoItem, b: UmbracoItem): number {
  return (
    num(b, "googleRating") - num(a, "googleRating") ||
    num(b, "googleRatingCount") - num(a, "googleRatingCount")
  );
}
