// Central SEO layer: canonical URLs, page metadata and JSON-LD builders.
//
// Everything is derived from the CMS item itself, so content added later is
// covered without touching this file. Editors can override the derived values
// per page with the "SEO" tab in the backoffice (metaTitle / metaDescription /
// noIndex), which is what `seoTitle`, `seoDescription` and `isNoIndex` read.

import type { Metadata } from "next";
import { num, photoUrl, text, type UmbracoItem } from "./umbraco";

export const SITE_NAME = "QueHacerRD";
export const SITE_LOCALE = "es_DO";

/**
 * Public origin of the portal, used for canonicals, Open Graph URLs, the
 * sitemap and JSON-LD @ids. Override per environment with NEXT_PUBLIC_SITE_URL;
 * the production domain is the default so a misconfigured staging deploy
 * points its canonicals at production instead of at itself.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://quehacerrd.com"
).replace(/\/+$/, "");

/** Route path without the Delivery API's trailing slash ("/" stays "/"). */
export function cleanPath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed || "/" : `/${trimmed}`;
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${cleanPath(path)}`;
}

/** Absolute URL for an image that may be a CMS-relative /media path. */
export function absoluteImage(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

// ---- title / description shaping ----

const MAX_TITLE = 60; // includes the " | QueHacerRD" suffix added by the template
const MAX_DESCRIPTION = 160;

const TITLE_BUDGET = MAX_TITLE - ` | ${SITE_NAME}`.length;

/** Collapse whitespace; Markdown/line breaks are meaningless in a meta tag. */
function flatten(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Truncate on a word boundary, adding an ellipsis only when text was cut. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** First non-empty candidate, flattened. */
export function firstText(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const flat = flatten(candidate ?? "");
    if (flat) return flat;
  }
  return "";
}

/**
 * First candidate that fits the SERP budget, from most to least descriptive.
 * If none fit, the last (shortest) one is returned whole — a title Google
 * truncates itself beats one we cut mid-name.
 */
export function clampTitle(...candidates: (string | null | undefined)[]): string {
  const usable = candidates.map((c) => flatten(c ?? "")).filter(Boolean);
  return usable.find((c) => c.length <= TITLE_BUDGET) ?? usable[usable.length - 1] ?? "";
}

export function clampDescription(...candidates: (string | null | undefined)[]): string {
  return truncate(firstText(...candidates), MAX_DESCRIPTION);
}

/** Editor override (SEO tab), else the first derived title that fits. */
export function seoTitle(
  item: UmbracoItem,
  ...candidates: (string | null | undefined)[]
): string {
  return firstText(text(item, "metaTitle")) || clampTitle(...candidates);
}

/** Editor override (SEO tab) or the first usable body text. */
export function seoDescription(
  item: UmbracoItem,
  ...candidates: (string | null | undefined)[]
): string {
  return clampDescription(text(item, "metaDescription"), ...candidates);
}

/** Whether an editor flagged this page as noindex in the SEO tab. */
export function isNoIndex(item: UmbracoItem): boolean {
  return item.properties["noIndex"] === true;
}

// ---- page metadata ----

export interface PageMetadataInput {
  title: string;
  description: string;
  /** CMS route path or app route; canonical and og:url are derived from it. */
  path: string;
  image?: string | null;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  noIndex?: boolean;
  /** Set for the home page, whose title already carries the brand. */
  absoluteTitle?: boolean;
}

/**
 * The metadata every page shares: a self-referencing canonical, Open Graph and
 * Twitter cards (so shared links render), and explicit robots directives.
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
  type = "website",
  publishedTime,
  modifiedTime,
  noIndex = false,
  absoluteTitle = false,
}: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  const images = absoluteImage(image) ? [{ url: absoluteImage(image)! }] : undefined;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description: description || undefined,
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: true }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      title,
      description: description || undefined,
      images,
      ...(type === "article" ? { publishedTime, modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description || undefined,
      images,
    },
  };
}

// ---- JSON-LD ----

export type JsonLd = Record<string, unknown>;

/** Drop undefined/null/empty members so the emitted JSON-LD stays valid. */
export function prune(data: JsonLd): JsonLd {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );
}

export function breadcrumbJsonLd(crumbs: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/** Listing pages: the ordered set of entries, so crawlers see the collection. */
export function itemListJsonLd(
  name: string,
  entries: { name: string; route: { path: string } }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      url: absoluteUrl(entry.route.path),
    })),
  };
}

/** Most specific schema.org business type per portal section. */
const SECTION_BUSINESS_TYPES: Record<string, string> = {
  restaurantes: "Restaurant",
  "bares-y-clubes": "BarOrPub",
  tiendas: "Store",
  cines: "MovieTheater",
  atracciones: "TouristAttraction",
  "empresas-y-servicios": "LocalBusiness",
};

export function businessType(routePath: string): string {
  const section = routePath.split("/").filter(Boolean)[1] ?? "";
  return SECTION_BUSINESS_TYPES[section] ?? "LocalBusiness";
}

// ---- opening hours ----

/** Spanish day abbreviations used in the free-text "Horario" property. */
const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const DAY_TOKENS: Record<string, number> = {
  dom: 0, lun: 1, mar: 2, mie: 3, mié: 3, jue: 4, juev: 4,
  vie: 5, vier: 5, sab: 6, sáb: 6,
};

function parseTime(hour: string, minute: string | undefined, meridiem: string | undefined): string {
  let h = Number(hour);
  const suffix = meridiem?.toLowerCase();
  if (suffix === "pm" && h < 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;
  return `${String(h % 24).padStart(2, "0")}:${minute ?? "00"}`;
}

const HOURS_LINE =
  /^\s*([a-záé]{3,4})\.?\s*(?:[-–—]|\ba\b)?\s*([a-záé]{3,4})?\.?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

/**
 * schema.org openingHoursSpecification from the free-text "Horario" property
 * (e.g. "Lun - Sáb 9:00AM - 9:00PM\nDom 11:00AM - 8:00PM", "Abierto 24 horas").
 * Unparseable lines are skipped; an empty result omits the property entirely.
 */
export function openingHoursJsonLd(hours: string): JsonLd[] {
  if (!hours.trim()) return [];
  if (/24\s*horas|24\/7/i.test(hours)) {
    return [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY_NAMES,
      opens: "00:00",
      closes: "23:59",
    }];
  }

  const specs: JsonLd[] = [];
  for (const line of hours.split(/\r?\n/)) {
    const match = HOURS_LINE.exec(line);
    if (!match) continue;
    const [, fromToken, toToken, oh, om, oap, ch, cm, cap] = match;
    const from = DAY_TOKENS[fromToken.toLowerCase()];
    if (from === undefined) continue;
    const to = toToken ? DAY_TOKENS[toToken.toLowerCase()] : from;
    if (to === undefined) continue;

    const days: string[] = [];
    for (let day = from; ; day = (day + 1) % 7) {
      days.push(DAY_NAMES[day]);
      if (day === to || days.length === 7) break;
    }
    specs.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: days,
      opens: parseTime(oh, om, oap),
      closes: parseTime(ch, cm, cap),
    });
  }
  return specs;
}

// ---- entity builders ----

function postalAddress(address: string, cityName: string, country: string): JsonLd | undefined {
  if (!address && !cityName) return undefined;
  return prune({
    "@type": "PostalAddress",
    streetAddress: address || undefined,
    addressLocality: cityName || undefined,
    addressCountry: country || "República Dominicana",
  });
}

function geo(item: UmbracoItem): JsonLd | undefined {
  const latitude = num(item, "latitude");
  const longitude = num(item, "longitude");
  if (latitude === 0 || longitude === 0) return undefined;
  return { "@type": "GeoCoordinates", latitude, longitude };
}

function aggregateRating(item: UmbracoItem): JsonLd | undefined {
  const value = num(item, "googleRating");
  const count = num(item, "googleRatingCount");
  if (value <= 0 || count <= 0) return undefined;
  return {
    "@type": "AggregateRating",
    ratingValue: value,
    reviewCount: count,
    bestRating: 5,
    worstRating: 1,
  };
}

export interface PlaceJsonLdInput {
  item: UmbracoItem;
  cityName: string;
  country: string;
  /** Resolved values (a branch inherits phone/hours/… from its company). */
  description?: string;
  phone?: string;
  website?: string;
  hours?: string;
  image?: string | null;
  /** Overrides the section-derived schema.org type (malls, companies). */
  type?: string;
}

/** A physical venue: place, company branch, mall or attraction. */
export function placeJsonLd({
  item,
  cityName,
  country,
  description,
  phone,
  website,
  hours,
  image,
  type,
}: PlaceJsonLdInput): JsonLd {
  const url = absoluteUrl(item.route.path);
  return prune({
    "@context": "https://schema.org",
    "@type": type ?? businessType(item.route.path),
    "@id": url,
    name: item.name,
    url,
    description: firstText(description ?? text(item, "description")) || undefined,
    image: absoluteImage(image ?? photoUrl(item)),
    telephone: firstText(phone ?? text(item, "phone")) || undefined,
    sameAs: firstText(website ?? text(item, "website")) || undefined,
    address: postalAddress(text(item, "address"), cityName, country),
    geo: geo(item),
    openingHoursSpecification: openingHoursJsonLd(hours ?? text(item, "hours")),
    aggregateRating: aggregateRating(item),
    amenityFeature: (item.properties["facilities"] as string[] | undefined)?.map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
  });
}

/** An empresa with branches: the parent Organization plus its locations. */
export function organizationJsonLd(
  item: UmbracoItem,
  branches: UmbracoItem[],
  cityName: string,
  country: string,
): JsonLd {
  const url = absoluteUrl(item.route.path);
  return prune({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": url,
    name: item.name,
    url,
    description: firstText(text(item, "description")) || undefined,
    logo: absoluteImage(photoUrl(item)),
    image: absoluteImage(photoUrl(item)),
    telephone: firstText(text(item, "phone")) || undefined,
    sameAs: firstText(text(item, "website")) || undefined,
    location: branches.map((branch) =>
      prune({
        "@type": "Place",
        name: branch.name,
        url: absoluteUrl(branch.route.path),
        address: postalAddress(text(branch, "address"), cityName, country),
        geo: geo(branch),
      }),
    ),
  });
}

export function eventJsonLd(item: UmbracoItem, cityName: string, country: string): JsonLd {
  const url = absoluteUrl(item.route.path);
  const startDate = typeof item.properties["startDate"] === "string" ? item.properties["startDate"] : "";
  const endDate = typeof item.properties["endDate"] === "string" ? item.properties["endDate"] : "";
  const venue = text(item, "venueName");
  return prune({
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": url,
    name: item.name,
    url,
    description: firstText(text(item, "description")) || undefined,
    image: absoluteImage(photoUrl(item)),
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: prune({
      "@type": "Place",
      name: venue || cityName,
      address: postalAddress(text(item, "address"), cityName, country),
      geo: geo(item),
    }),
    offers: text(item, "website")
      ? { "@type": "Offer", url: text(item, "website"), availability: "https://schema.org/InStock" }
      : undefined,
  });
}

export function articleJsonLd(item: UmbracoItem, summary: string): JsonLd {
  const url = absoluteUrl(item.route.path);
  const published = typeof item.properties["publishDate"] === "string"
    ? item.properties["publishDate"]
    : item.createDate;
  return prune({
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": url,
    mainEntityOfPage: url,
    headline: truncate(item.name, 110),
    description: summary || undefined,
    image: absoluteImage(text(item, "heroImageUrl")),
    datePublished: published || undefined,
    dateModified: item.updateDate || published || undefined,
    articleSection: firstText(text(item, "category")) || undefined,
    author: text(item, "author")
      ? { "@type": "Person", name: text(item, "author") }
      : { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: publisherJsonLd(),
  });
}

export function movieJsonLd(item: UmbracoItem): JsonLd {
  const url = absoluteUrl(item.route.path);
  const minutes = Number(text(item, "duration"));
  const trailerId = text(item, "trailerYoutubeId");
  return prune({
    "@context": "https://schema.org",
    "@type": "Movie",
    "@id": url,
    name: item.name,
    url,
    description: firstText(text(item, "synopsis")) || undefined,
    image: absoluteImage(text(item, "posterUrl")),
    genre: firstText(text(item, "genre")) || undefined,
    contentRating: firstText(text(item, "rating")) || undefined,
    duration: Number.isFinite(minutes) && minutes > 0 ? `PT${minutes}M` : undefined,
    trailer: trailerId
      ? {
          "@type": "VideoObject",
          name: `Trailer de ${item.name}`,
          embedUrl: `https://www.youtube.com/embed/${trailerId}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${trailerId}/hqdefault.jpg`,
        }
      : undefined,
  });
}

/** The portal itself, referenced as the publisher of every article. */
export function publisherJsonLd(): JsonLd {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.svg` },
  };
}

/** Site-wide identity, emitted once on the home page. */
export function siteJsonLd(): JsonLd[] {
  return [
    {
      "@context": "https://schema.org",
      ...publisherJsonLd(),
      description:
        "Guía de ciudades de República Dominicana: restaurantes, bares, tiendas, cines, atracciones y eventos.",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: `${SITE_NAME}.com`,
      url: SITE_URL,
      inLanguage: "es-DO",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ];
}
