// Typed client for the Umbraco Content Delivery API v2.
// All fetches are server-side and cached with ISR (revalidate below).

const BASE_URL = process.env.UMBRACO_BASE_URL ?? "http://localhost:54509";
export const REVALIDATE_SECONDS = 600;

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

interface UmbracoList {
  total: number;
  items: UmbracoItem[];
}

async function api(path: string): Promise<Response> {
  return fetch(`${BASE_URL}/umbraco/delivery/api/v2${path}`, {
    // Tagged so /api/revalidate (called by an Umbraco webhook on publish/
    // unpublish/delete) can drop every CMS response at once; the time-based
    // revalidate stays as a fallback.
    next: { revalidate: REVALIDATE_SECONDS, tags: ["umbraco"] },
  });
}

/** Fetch a single content item by its route path (e.g. "/santo-domingo/restaurantes"). */
export async function getItem(path: string): Promise<UmbracoItem | null> {
  const res = await api(`/content/item${path.startsWith("/") ? path : `/${path}`}`);
  if (!res.ok) return null;
  return res.json();
}

/** Fetch direct children of a content item, ordered by sortOrder. */
export async function getChildren(path: string, take = 100): Promise<UmbracoItem[]> {
  const res = await api(
    `/content?fetch=${encodeURIComponent(`children:${path}`)}&sort=sortOrder:asc&take=${take}`,
  );
  if (!res.ok) return [];
  const data: UmbracoList = await res.json();
  return data.items;
}

/** Fetch all descendants of a content item filtered to one content type. */
export async function getDescendantsOfType(
  path: string,
  contentType: string,
  take = 500,
): Promise<UmbracoItem[]> {
  const res = await api(
    `/content?fetch=${encodeURIComponent(`descendants:${path}`)}&filter=${encodeURIComponent(
      `contentType:${contentType}`,
    )}&take=${take}`,
  );
  if (!res.ok) return [];
  const data: UmbracoList = await res.json();
  return data.items;
}

/**
 * Every descendant of a content item, whatever its type, paged through the
 * Delivery API. Used by the sitemap, which must cover content types nobody
 * enumerated explicitly.
 */
export async function getDescendants(path: string, max = 5000): Promise<UmbracoItem[]> {
  const pageSize = 100;
  const items: UmbracoItem[] = [];
  for (let skip = 0; skip < max; skip += pageSize) {
    const res = await api(
      `/content?fetch=${encodeURIComponent(`descendants:${path}`)}&skip=${skip}&take=${pageSize}`,
    );
    if (!res.ok) break;
    const data: UmbracoList = await res.json();
    items.push(...data.items);
    if (items.length >= data.total || data.items.length === 0) break;
  }
  return items;
}

/** All cities in the portal (children of the site root). */
export async function getCities(): Promise<UmbracoItem[]> {
  const res = await api(
    `/content?filter=${encodeURIComponent("contentType:city")}&take=50`,
  );
  if (!res.ok) return [];
  const data: UmbracoList = await res.json();
  return data.items;
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
  const value = item.properties[alias];
  if (!Array.isArray(value) || value.length === 0) return null;
  const media = value[0] as MediaItem;
  return media?.url || null;
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
