// Central SEO layer: canonical URLs, page metadata and JSON-LD builders.
//
// Everything is derived from the CMS item itself, so content added later is
// covered without touching this file. Editors can override the derived values
// per page with the "SEO" tab in the backoffice (metaTitle / metaDescription /
// noIndex), which is what `seoTitle`, `seoDescription` and `isNoIndex` read.

import type { Metadata } from "next";
import { branchDisplayName } from "./branches";
import {
  DEFAULT_LOCALE,
  HREFLANG,
  HTML_LANG,
  OG_LOCALE,
  t,
  type Locale,
} from "./i18n";
import type { MenuGroup } from "./menu";
import { canonicalPath } from "./sectionSlugs";
import { SOCIAL_ACCOUNTS } from "./social";
import { num, photoUrl, text, type UmbracoItem } from "./umbraco";

export const SITE_NAME = "QueHacerRD";

/** Title and description of the portal itself: the home page's own metadata and
 * the default every page below inherits from the root layout. */
/** Where the portal is, for an address the CMS left without a country. */
const DEFAULT_COUNTRY = "República Dominicana";

export function siteTitle(locale: Locale): string {
  return t(locale).site.title;
}

export function siteDescription(locale: Locale): string {
  return t(locale).site.description;
}

export function siteKeywords(locale: Locale): string[] {
  return t(locale).site.keywords;
}

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
export function absoluteImage(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url)
    ? url
    : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

// ---- title / description shaping ----

const MAX_TITLE = 60; // includes the " | QueHacerRD" suffix added by the template
const MAX_DESCRIPTION = 160;
/** Below this an editor's introduction is completed with the derived lead. */
const MIN_STANDALONE_DESCRIPTION = 96;

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
export function firstText(
  ...candidates: (string | null | undefined)[]
): string {
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
export function clampTitle(
  ...candidates: (string | null | undefined)[]
): string {
  const usable = candidates.map((c) => flatten(c ?? "")).filter(Boolean);
  return (
    usable.find((c) => c.length <= TITLE_BUDGET) ??
    usable[usable.length - 1] ??
    ""
  );
}

export function clampDescription(
  ...candidates: (string | null | undefined)[]
): string {
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
  /** The language this page is written in. */
  locale: Locale;
  /**
   * The same page in the other language, when it has one. Both are then declared
   * as alternates of each other — a page only claims an hreflang pair when the
   * counterpart really exists, or the pair points at a 404 and Google drops both.
   */
  alternate?: { locale: Locale; path: string } | null;
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
  locale,
  alternate,
  image,
  type = "website",
  publishedTime,
  modifiedTime,
  noIndex = false,
  absoluteTitle = false,
}: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  // Only spread when there is one: an `images` key set to undefined still counts
  // as metadata declaring its own images, and the branded fallback card
  // (app/opengraph-image.tsx) is then never applied — every shared link lost its
  // preview image.
  const images = absoluteImage(image)
    ? { images: [{ url: absoluteImage(image)! }] }
    : {};
  // Each language points at itself and at the other, and x-default at Spanish —
  // the portal's own language and the one a visitor with no preference gets.
  const languages = alternate
    ? {
        [HREFLANG[locale]]: url,
        [HREFLANG[alternate.locale]]: absoluteUrl(alternate.path),
        "x-default": absoluteUrl(
          locale === DEFAULT_LOCALE ? path : alternate.path,
        ),
      }
    : undefined;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description: description || undefined,
    alternates: { canonical: url, ...(languages ? { languages } : {}) },
    robots: noIndex
      ? { index: false, follow: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      ...(alternate ? { alternateLocale: OG_LOCALE[alternate.locale] } : {}),
      title,
      description: description || undefined,
      ...images,
      ...(type === "article" ? { publishedTime, modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description || undefined,
      ...images,
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

export function breadcrumbJsonLd(
  crumbs: { name: string; path: string }[],
): JsonLd {
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

/**
 * The lead sentence of a listing page — what the page holds, in the words a
 * visitor would type. Rendered on the page when no editor wrote an intro and
 * used as its meta description, so the snippet and the page say the same thing;
 * the section, the section above it and the count make it unique per page.
 * Empty for an empty listing, which has nothing to promise.
 */
export function listingLead({
  name,
  parentName,
  cityName,
  count,
  locale,
  named = true,
}: {
  name: string;
  parentName?: string;
  cityName?: string;
  count: number;
  locale: Locale;
  /** False on the page itself, where the heading already names the section. */
  named?: boolean;
}): string {
  if (count <= 0) return "";
  const words = t(locale).listing;
  // Avoid "Restaurantes de Santo Domingo en Santo Domingo".
  const where =
    cityName && !name.toLowerCase().includes(cityName.toLowerCase())
      ? words.inCity(cityName)
      : "";
  const places = words.places(count);
  if (!named) return `${places}${where} ${words.what}`;
  const what = parentName ? `${name} — ${parentName}` : name;
  return `${what}${where}: ${places} ${words.what}`;
}

/**
 * The meta description of a listing page: the editor's introduction, completed
 * with the derived lead when it is too short to fill a snippet on its own
 * ("Tiendas y centros comerciales." leaves two thirds of the budget unused, and
 * says nothing a searcher can act on).
 */
export function listingDescription(intro: string, lead: string): string {
  if (!intro) return lead;
  if (!lead || intro.length >= MIN_STANDALONE_DESCRIPTION) return intro;
  return `${intro} ${lead}`;
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

/** The types schema.org lets carry a menu: a shop with a "hasMenu" is invalid data. */
const MENU_TYPES = new Set(["Restaurant", "BarOrPub", "CafeOrCoffeeShop", "FoodEstablishment"]);

export function businessType(routePath: string): string {
  const section = canonicalPath(routePath).split("/").filter(Boolean)[1] ?? "";
  return SECTION_BUSINESS_TYPES[section] ?? "LocalBusiness";
}

/**
 * What a place declares as its menu. A carta the model structured is a real `Menu`,
 * section by section and dish by dish — that is the whole point of storing it as text
 * instead of as a picture. A place whose menu is only a set of scanned pages says
 * nothing to a search engine about what is on them, so it declares the address it was
 * read from and no more.
 */
function menuJsonLd(sections: MenuGroup[] | undefined, url: string | undefined) {
  if (!sections?.length) return url;
  return prune({
    "@type": "Menu",
    url,
    hasMenuSection: sections.map((section) => ({
      "@type": "MenuSection",
      name: section.name,
      hasMenuItem: section.items.map((dish) =>
        prune({
          "@type": "MenuItem",
          name: dish.name,
          description: dish.description,
          offers: menuOffer(dish.price),
        }),
      ),
    })),
  });
}

/**
 * A dish's price as an offer, and only when the carta states one plain number: "RD$450"
 * is 450 pesos, while "Desde RD$284" and "RD$180 / RD$320" are a floor and a choice.
 * Declaring either of those as *the* price would publish a figure the restaurant never
 * quoted, so they are left as the text the page prints.
 */
function menuOffer(price: string | undefined) {
  const digits = /^RD\$\s?([\d.,]+)$/.exec(price?.trim() ?? "")?.[1];
  if (digits === undefined) return undefined;

  // "1,250" and "1.250" are both one thousand two hundred and fifty: a separator with
  // exactly three digits behind it groups thousands, anything else is the decimal.
  const separator = Math.max(digits.lastIndexOf(","), digits.lastIndexOf("."));
  const decimals = separator >= 0 && digits.length - separator - 1 !== 3;
  const normalized = decimals
    ? `${digits.slice(0, separator).replace(/[.,]/g, "")}.${digits.slice(separator + 1)}`
    : digits.replace(/[.,]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0
    ? { "@type": "Offer", price: amount, priceCurrency: "DOP" }
    : undefined;
}

// ---- opening hours ----

/** Spanish day abbreviations used in the free-text "Horario" property. */
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
/**
 * "Horario" is free text and arrives in either language: Google's own
 * "lunes: 11:00–23:00" and the English the translation pass writes from it, plus
 * the abbreviations an editor types by hand ("Lun - Sáb", "Mon - Sun").
 */
const DAY_TOKENS: Record<string, number> = {
  dom: 0,
  domingo: 0,
  sun: 0,
  sunday: 0,
  lun: 1,
  lunes: 1,
  mon: 1,
  monday: 1,
  mar: 2,
  martes: 2,
  tue: 2,
  tues: 2,
  tuesday: 2,
  mie: 3,
  mié: 3,
  miercoles: 3,
  miércoles: 3,
  wed: 3,
  wednesday: 3,
  jue: 4,
  juev: 4,
  jueves: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  vie: 5,
  vier: 5,
  viernes: 5,
  fri: 5,
  friday: 5,
  sab: 6,
  sáb: 6,
  sabado: 6,
  sábado: 6,
  sat: 6,
  saturday: 6,
};

function parseTime(
  hour: string,
  minute: string | undefined,
  meridiem: string | undefined,
): string {
  let h = Number(hour);
  const suffix = meridiem?.toLowerCase();
  if (suffix === "pm" && h < 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;
  return `${String(h % 24).padStart(2, "0")}:${minute ?? "00"}`;
}

// One day or a range of them, then the two times. The day may be abbreviated or
// written out, and may be followed by a colon — which is how Google writes it.
const HOURS_LINE =
  /^\s*([a-záéí]{3,9})\.?\s*(?:[-–—]|\ba\b|\bto\b)?\s*([a-záéí]{3,9})?\.?\s*:?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

/**
 * schema.org openingHoursSpecification from the free-text "Horario" property
 * (e.g. "Lun - Sáb 9:00AM - 9:00PM\nDom 11:00AM - 8:00PM", "Abierto 24 horas").
 * Unparseable lines are skipped; an empty result omits the property entirely.
 */
export function openingHoursJsonLd(hours: string): JsonLd[] {
  if (!hours.trim()) return [];
  if (/24\s*(?:horas|hours)|24\/7/i.test(hours)) {
    return [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: DAY_NAMES,
        opens: "00:00",
        closes: "23:59",
      },
    ];
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

function postalAddress(
  address: string,
  cityName: string,
  country: string,
): JsonLd | undefined {
  if (!address && !cityName) return undefined;
  return prune({
    "@type": "PostalAddress",
    streetAddress: address || undefined,
    addressLocality: cityName || undefined,
    addressCountry: country || DEFAULT_COUNTRY,
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
  /** Overrides the node name (a branch is named under its company). */
  name?: string;
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
  /** The carta already parsed by the view, when the place carries one. */
  menu?: MenuGroup[];
}

/** A physical venue: place, company branch, mall or attraction. */
export function placeJsonLd({
  item,
  name,
  cityName,
  country,
  description,
  phone,
  website,
  hours,
  image,
  type,
  menu,
}: PlaceJsonLdInput): JsonLd {
  const url = absoluteUrl(item.route.path);
  return prune({
    "@context": "https://schema.org",
    "@type": type ?? businessType(item.route.path),
    "@id": url,
    name: name ?? item.name,
    url,
    description:
      firstText(description ?? text(item, "description")) || undefined,
    image: absoluteImage(image ?? photoUrl(item)),
    telephone: firstText(phone ?? text(item, "phone")) || undefined,
    sameAs: firstText(website ?? text(item, "website")) || undefined,
    address: postalAddress(text(item, "address"), cityName, country),
    geo: geo(item),
    openingHoursSpecification: openingHoursJsonLd(hours ?? text(item, "hours")),
    hasMenu: MENU_TYPES.has(type ?? businessType(item.route.path))
      ? menuJsonLd(menu, firstText(text(item, "menuSource")) || undefined)
      : undefined,
    aggregateRating: aggregateRating(item),
    amenityFeature: (
      item.properties["facilities"] as string[] | undefined
    )?.map((name) => ({
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
        name: branchDisplayName(branch.name, item.name),
        url: absoluteUrl(branch.route.path),
        address: postalAddress(text(branch, "address"), cityName, country),
        geo: geo(branch),
      }),
    ),
  });
}

export function eventJsonLd(
  item: UmbracoItem,
  cityName: string,
  country: string,
  locale: Locale,
): JsonLd {
  const url = absoluteUrl(item.route.path);
  const startDate =
    typeof item.properties["startDate"] === "string"
      ? item.properties["startDate"]
      : "";
  const endDate =
    typeof item.properties["endDate"] === "string"
      ? item.properties["endDate"]
      : "";
  const venue = text(item, "venueName");
  return prune({
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": url,
    inLanguage: HTML_LANG[locale],
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
      ? {
          "@type": "Offer",
          url: text(item, "website"),
          availability: "https://schema.org/InStock",
        }
      : undefined,
  });
}

export function articleJsonLd(
  item: UmbracoItem,
  summary: string,
  locale: Locale,
): JsonLd {
  const url = absoluteUrl(item.route.path);
  const published =
    typeof item.properties["publishDate"] === "string"
      ? item.properties["publishDate"]
      : item.createDate;
  return prune({
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": url,
    mainEntityOfPage: url,
    inLanguage: HTML_LANG[locale],
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

export function movieJsonLd(item: UmbracoItem, locale: Locale): JsonLd {
  const url = absoluteUrl(item.route.path);
  const minutes = Number(text(item, "duration"));
  const trailerId = text(item, "trailerYoutubeId");
  const imdbId = text(item, "imdbId");
  const imdbRating = Number(text(item, "imdbRating"));
  const imdbVotes = Number(text(item, "imdbVotes"));
  return prune({
    "@context": "https://schema.org",
    "@type": "Movie",
    "@id": url,
    inLanguage: HTML_LANG[locale],
    name: item.name,
    url,
    description: firstText(text(item, "synopsis")) || undefined,
    image: absoluteImage(text(item, "posterUrl")),
    genre: firstText(text(item, "genre")) || undefined,
    contentRating: firstText(text(item, "rating")) || undefined,
    duration:
      Number.isFinite(minutes) && minutes > 0 ? `PT${minutes}M` : undefined,
    trailer: trailerId
      ? {
          "@type": "VideoObject",
          name: `Trailer de ${item.name}`,
          embedUrl: `https://www.youtube.com/embed/${trailerId}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${trailerId}/hqdefault.jpg`,
        }
      : undefined,
    sameAs: imdbId ? [`https://www.imdb.com/title/${imdbId}/`] : undefined,
    // IMDb's own score, credited to it — the portal rates nothing itself.
    aggregateRating:
      Number.isFinite(imdbRating) && imdbRating > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: imdbRating,
            bestRating: 10,
            worstRating: 1,
            ratingCount:
              Number.isFinite(imdbVotes) && imdbVotes > 0
                ? imdbVotes
                : undefined,
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
    // The profiles the portal publishes to: what ties the site and the accounts
    // together for a search engine, and the reason they live in one module.
    sameAs: SOCIAL_ACCOUNTS.map((account) => account.url),
  };
}

/** Site-wide identity, emitted once on the home page. */
export function siteJsonLd(locale: Locale): JsonLd[] {
  return [
    {
      "@context": "https://schema.org",
      ...publisherJsonLd(),
      description: t(locale).site.organizationDescription,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: `${SITE_NAME}.com`,
      url: SITE_URL,
      inLanguage: HTML_LANG[locale],
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ];
}
