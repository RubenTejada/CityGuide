import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import ArticleBody from "@/components/ArticleBody";
import BreadcrumbBar, {
  type Crumb,
  type CrumbLink,
} from "@/components/Breadcrumb";
import DirectionsLink from "@/components/DirectionsLink";
import JsonLd from "@/components/JsonLd";
import ArticleCard, { articleDate } from "@/components/ArticleCard";
import FacilityBadges, { FACILITY_ICONS } from "@/components/FacilityBadges";
import AttractionCard from "@/components/AttractionCard";
import TourCard from "@/components/TourCard";
import ListingViews from "@/components/ListingViews";
import ListingPagination from "@/components/ListingPagination";
import SubcategoryLinks from "@/components/SubcategoryLinks";
import { type MapMarker } from "@/components/MarkersMap";
import { type ListingView } from "@/components/ViewToggle";
import PhotoFit, { photoBoxAspect } from "@/components/PhotoFit";
import PlaceCard from "@/components/PlaceCard";
import MenuDialog from "@/components/MenuDialog";
import MenuViewer from "@/components/MenuViewer";
import ReservationDialog from "@/components/ReservationDialog";
import PhotoGallery from "@/components/PhotoGallery";
import PlaceMap from "@/components/PlaceMap";
import Rating from "@/components/Rating";
import ShareButtons from "@/components/ShareButtons";
import Cartelera from "@/components/cine/Cartelera";
import DateTabs from "@/components/cine/DateTabs";
import MovieReviewBadges from "@/components/cine/MovieReviewBadges";
import MovieShowtimes from "@/components/cine/MovieShowtimes";
import {
  EventCard,
  eventEntry,
  eventMarkers,
  isPastEvent,
  monthLabel,
  recurrenceLabel,
  type EventEntry,
} from "@/components/EventsList";
import ThingsToDoExplorer, {
  guidePicks,
  type GuideAttractions,
  type GuideEvents,
  type GuideMovies,
  type GuideSection,
} from "@/components/ThingsToDoExplorer";
import TrailerModal from "@/components/cine/TrailerModal";
import { branchDisplayName } from "@/lib/branches";
import { itemDirectionsUrl } from "@/lib/directions";
import {
  CINEMAS_BY_CITY,
  addDays,
  cinemaByName,
  cinemaSiteIds,
  getAvailableDates,
  getMovieShowings,
  movieReviews,
  todayInDR,
} from "@/lib/cinema";
import {
  INTL_LOCALE,
  contentSegments,
  facilityLabel,
  type Locale,
  localeHref,
  t,
} from "@/lib/i18n";
import { hasMenu, placeMenu } from "@/lib/menu";
import { curatedPhoto, curatedPhotoCredit } from "@/lib/photos";
import {
  durationLabel,
  includedItems,
  priceLabel,
  tourMeta,
  tourOperators,
} from "@/lib/tour";
import { acceptsReservations } from "@/lib/reservation";
import { getTopMovies } from "@/lib/movieCatalog";
import { canonicalSlug, localizedSectionPath } from "@/lib/sectionSlugs";
import {
  categoryPath,
  eventCategoryIcon,
  mapPinIcon,
  navIcon,
  sectionListImage,
  subcategoryIcon,
} from "@/lib/sections";
import {
  filterEntries,
  listingPage,
  pageEntries,
  LISTING_PAGE_SIZE,
  selectedFilters,
  canonicalListingPath,
  withPage,
  PAGE_PARAM,
  type FilterGroup,
  type ListingQuery,
} from "@/lib/listing";
import {
  DAY_TOKENS,
  absoluteUrl,
  articleJsonLd,
  breadcrumbJsonLd,
  eventJsonLd,
  isNoIndex,
  itemListJsonLd,
  listingDescription,
  listingLead,
  movieJsonLd,
  organizationJsonLd,
  pageMetadata,
  placeJsonLd,
  seoDescription,
  seoTitle,
  tourJsonLd,
} from "@/lib/seo";
import {
  activeLocale,
  alternateOf,
  getChildren,
  getCities,
  getDescendantsOfType,
  getItem,
} from "@/lib/cms";
import {
  byRating,
  facilities,
  isUnder,
  num,
  photoOf,
  photosOf,
  photoUrl,
  picked,
  slugOf,
  text,
  type UmbracoItem,
} from "@/lib/umbraco";
import { getCityWeather } from "@/lib/weather";

export const revalidate = 600;

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; city: string; slug: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { lang, city, slug } = await params;
  const locale = lang as Locale;
  const path = `/${city}/${slug.join("/")}`;
  // Which entries a listing shows, and which day a cartelera is read for, are
  // both in the query string and both settled on the server.
  const [item, query] = await Promise.all([getItem(path), searchParams]);
  if (!item) notFound();
  const fecha = typeof query.fecha === "string" ? query.fecha : undefined;

  switch (item.contentType) {
    case "categoryPage":
      return (
        <CategoryView item={item} citySlug={city} query={query} fecha={fecha} />
      );
    case "subcategory":
      return <SubcategoryView item={item} query={query} />;
    case "company":
      return <CompanyView item={item} query={query} />;
    case "mall":
      return <MallView item={item} />;
    case "place": {
      // A cinema branch page ("Cines" section) also shows its own cartelera.
      const cinema = slug.map(canonicalSlug).includes("cines")
        ? cinemaByName(city, item.name)
        : null;
      if (cinema) {
        return (
          <>
            <PlaceView item={item} />
            <div className="mx-auto max-w-6xl px-6 pb-8">
              <Cartelera
                citySlug={city}
                basePath={item.route.path}
                selectedDate={fecha}
                cinema={cinema}
                locale={locale}
              />
            </div>
          </>
        );
      }
      return <PlaceView item={item} />;
    }
    case "tour":
      return <TourView item={item} />;
    case "movie":
      return <MovieView item={item} citySlug={city} fecha={fecha} />;
    case "eventsPage":
      return <EventsView item={item} query={query} />;
    case "eventItem":
      return <EventView item={item} />;
    case "thingsToDoPage":
      return <ThingsToDoView item={item} citySlug={city} query={query} />;
    case "articlesPage":
      return <ArticlesView item={item} query={query} />;
    case "article":
      return <ArticleView item={item} />;
    default:
      notFound();
  }
}

/** The city node a content path belongs to (its first path segment). */
async function cityOf(item: UmbracoItem): Promise<UmbracoItem | null> {
  const citySlug = contentSegments(item.route.path)[0] ?? "";
  return citySlug ? getItem(`/${citySlug}`) : null;
}

/** The item one level up, or null at the city level. */
async function parentOf(item: UmbracoItem): Promise<UmbracoItem | null> {
  const segments = item.route.path.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  return getItem(`/${segments.slice(0, -1).join("/")}`);
}

/**
 * How many pages the listing of this item holds — what tells a `?pagina=` URL
 * apart from one that is simply out of range and belongs to no page at all.
 * Only the types that paginate answer with more than one.
 */
async function listingPageCount(item: UmbracoItem): Promise<number> {
  const entries = await (async () => {
    switch (item.contentType) {
      case "categoryPage":
      case "subcategory":
        return listingCount(item.route.path);
      case "company":
      case "articlesPage":
        return (await getChildren(item.route.path)).filter((child) =>
          item.contentType === "company"
            ? child.contentType === "place"
            : child.contentType === "article",
        ).length;
      case "eventsPage":
        return (await getChildren(item.route.path)).length;
      default:
        return 0;
    }
  })();
  return Math.max(1, Math.ceil(entries / LISTING_PAGE_SIZE));
}

/**
 * Title/description per document type. Everything is derived from the item and
 * its ancestors, so a new place or article is optimised the moment it is
 * published; editors can still override any of it from the SEO tab.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; city: string; slug: string[] }>;
  searchParams: Promise<ListingQuery>;
}): Promise<Metadata> {
  const { lang, city: citySlug, slug } = await params;
  const locale = lang as Locale;
  const [item, query] = await Promise.all([
    getItem(`/${citySlug}/${slug.join("/")}`),
    searchParams,
  ]);
  if (!item) return {};

  // Page 2 of a listing is a page of its own and says so; a ticked filter, the
  // map view and the day of a cartelera all fold into the bare URL.
  const canonical = canonicalListingPath(
    item.route.path,
    query,
    await listingPageCount(item),
  );
  const pageNumber = canonical.includes(`${PAGE_PARAM}=`)
    ? Number(canonical.slice(canonical.lastIndexOf("=") + 1))
    : 1;

  const [cityItem, parent] = await Promise.all([cityOf(item), parentOf(item)]);
  const cityName = cityItem?.name ?? "";
  // Avoid "Malecón de Santo Domingo en Santo Domingo".
  const words = t(locale).seo;
  const inCity =
    cityName && !item.name.toLowerCase().includes(cityName.toLowerCase())
      ? words.inCity(cityName)
      : "";
  // The company/subcategory/category a place hangs from, used to qualify titles.
  const parentName = parent && parent.contentType !== "city" ? parent.name : "";
  const qualified = parentName
    ? `${item.name} — ${parentName}${inCity}`
    : `${item.name}${inCity}`;

  let title = `${item.name}${inCity}`;
  let description = "";
  let image = photoUrl(item);
  let type: "website" | "article" = "website";
  let publishedTime: string | undefined;
  let modifiedTime: string | undefined;

  switch (item.contentType) {
    case "categoryPage":
      title = seoTitle(item, `${item.name}${inCity}`, item.name);
      description = seoDescription(
        item,
        // The editor's introduction, completed with what the page actually
        // holds when it is too short to be a snippet on its own.
        listingDescription(
          text(item, "intro"),
          listingLead({
            name: item.name,
            cityName,
            count: await listingCount(item.route.path),
            locale,
          }),
        ),
        words.categoryFallback(item.name, inCity),
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "subcategory":
      title = seoTitle(item, qualified, `${item.name}${inCity}`, item.name);
      description = seoDescription(
        item,
        listingDescription(
          text(item, "intro"),
          listingLead({
            name: item.name,
            parentName,
            cityName,
            count: await listingCount(item.route.path),
            locale,
          }),
        ),
        words.subcategoryFallback(item.name, parentName, inCity),
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "place":
    case "mall": {
      const company = parent?.contentType === "company" ? parent : null;
      const inherited = (alias: string) =>
        text(item, alias) || (company ? text(company, alias) : "");
      const displayName = branchDisplayName(item.name, company?.name);
      title = seoTitle(
        item,
        company ? `${displayName}${inCity}` : qualified,
        `${displayName}${inCity}`,
        displayName,
      );
      description = seoDescription(
        item,
        inherited("description"),
        words.placeFallback(displayName, text(item, "address"), inCity),
      );
      image =
        image ??
        (company ? photoUrl(company) : null) ??
        sectionListImage(item.route.path);
      break;
    }
    case "company":
      title = seoTitle(
        item,
        words.companyTitle(item.name, inCity),
        `${item.name}${inCity}`,
        item.name,
      );
      description = seoDescription(
        item,
        text(item, "description"),
        words.companyFallback(item.name, inCity),
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "tour": {
      const duration = durationLabel(item, locale, t(locale).tours) ?? "";
      title = seoTitle(item, `${item.name}${inCity}`, item.name);
      description = seoDescription(
        item,
        text(item, "description"),
        words.tourFallback(item.name, duration, inCity),
      );
      image =
        image ??
        curatedPhoto(citySlug, slugOf(item)) ??
        sectionListImage(item.route.path);
      break;
    }
    case "movie":
      title = seoTitle(
        item,
        words.movieTitle(item.name, inCity),
        words.movieTitle(item.name, ""),
        item.name,
      );
      description = seoDescription(
        item,
        text(item, "synopsis"),
        words.movieFallback(item.name, inCity),
      );
      image = text(item, "posterUrl") || image;
      break;
    case "eventsPage":
      title = seoTitle(item, words.eventsTitle(inCity));
      description = seoDescription(
        item,
        text(item, "intro"),
        words.eventsFallback(inCity),
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "eventItem": {
      const dates = formatDate(item.properties["startDate"], locale);
      title = seoTitle(
        item,
        dates ? `${item.name} — ${dates}${inCity}` : `${item.name}${inCity}`,
        `${item.name}${inCity}`,
        item.name,
      );
      description = seoDescription(
        item,
        text(item, "description"),
        words.eventFallback(item.name, dates, text(item, "venueName"), inCity),
      );
      break;
    }
    case "thingsToDoPage":
      title = seoTitle(item, words.thingsToDoTitle(inCity));
      description = seoDescription(
        item,
        text(item, "intro"),
        words.thingsToDoFallback(inCity),
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "articlesPage":
      title = seoTitle(item, `${item.name}${inCity}`, item.name);
      description = seoDescription(
        item,
        text(item, "intro"),
        words.articlesFallback(inCity),
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "article":
      title = seoTitle(item, item.name);
      description = seoDescription(
        item,
        text(item, "summary"),
        text(item, "body"),
      );
      image = text(item, "heroImageUrl") || image;
      type = "article";
      publishedTime =
        typeof item.properties["publishDate"] === "string"
          ? item.properties["publishDate"]
          : item.createDate;
      modifiedTime = item.updateDate;
      break;
    default:
      title = seoTitle(item, `${item.name}${inCity}`, item.name);
      description = seoDescription(item, text(item, "description"));
  }

  if (pageNumber > 1) {
    // Sixty-eight pages sharing one title are sixty-eight duplicates.
    title = `${title}${t(locale).listing.pageSuffix(pageNumber)}`;
  }
  const alternate = await alternateOf(item, locale);

  return pageMetadata({
    title,
    description,
    path: canonical,
    locale,
    alternate:
      alternate && pageNumber > 1
        ? {
            ...alternate,
            path: withPage(alternate.path, pageNumber),
          }
        : alternate,
    image,
    type,
    publishedTime,
    modifiedTime,
    noIndex: isNoIndex(item),
  });
}

/**
 * The content types a crumb can be switched for: the pages the portal is
 * browsed by. A place, a company, a mall, an event or a film is a destination,
 * not a level — its crumb carries no selector.
 */
const NAVIGABLE_TYPES = new Set([
  "city",
  "categoryPage",
  "eventsPage",
  "thingsToDoPage",
  "subcategory",
]);

/**
 * The pages one crumb can be swapped for. A city's sections are of three
 * different document types ("Eventos" and "Qué Hacer" are their own), so they
 * are taken whole; deeper down the siblings are filtered to the crumb's own
 * type, since a section holds its subcategories beside hundreds of places.
 */
async function crumbSiblings(
  node: UmbracoItem,
  parent: UmbracoItem | undefined,
): Promise<UmbracoItem[]> {
  if (!NAVIGABLE_TYPES.has(node.contentType)) return [];
  if (!parent) return getCities();
  return parent.contentType === "city"
    ? getChildren(parent.route.path)
    : getChildren(parent.route.path, 100, undefined, node.contentType);
}

function crumbLink(node: { name: string; route: { path: string } }): CrumbLink {
  return {
    name: node.name,
    path: node.route.path,
    icon: navIcon(node.route.path),
  };
}

async function Breadcrumb({ item }: { item: UmbracoItem }) {
  const segments = item.route.path.split("/").filter(Boolean);
  // "/en" is the language, not an ancestor: it has no page of its own.
  const first = segments[0] === "en" ? 1 : 0;
  const ancestors = await Promise.all(
    segments.slice(first, -1).map(async (_, offset) => {
      const index = first + offset;
      const ancestorPath = `/${segments.slice(0, index + 1).join("/")}`;
      return getItem(ancestorPath);
    }),
  );
  const nodes = [...ancestors.filter((node) => node !== null), item];
  const crumbs = await Promise.all(
    nodes.map(async (node, index) => ({
      ...crumbLink(node),
      siblings: (await crumbSiblings(node, nodes[index - 1])).map(crumbLink),
    })),
  );
  const locale = await activeLocale();
  const home = localeHref(locale, "/");
  const trail: Crumb[] = [
    {
      name: t(locale).nav.home,
      path: home,
      icon: navIcon(home),
      siblings: [],
    },
    ...crumbs,
  ];
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <BreadcrumbBar trail={trail} />
    </>
  );
}

function PageShell({
  item,
  children,
}: {
  item: UmbracoItem;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-6xl px-6 pt-0 pb-8">
      <Breadcrumb item={item} />
      {children}
    </main>
  );
}

/**
 * Companies and malls are listed as single cards; their branch places and
 * inner establishments are only shown inside their own page, never flattened
 * into category/subcategory listings.
 */
async function listingEntries(path: string): Promise<UmbracoItem[]> {
  // Only the "Tours" section holds excursions, so only there is the extra query
  // worth making: everywhere else it would cost one request per listing to find
  // nothing.
  const [places, companies, malls, tours] = await Promise.all([
    getDescendantsOfType(path, "place"),
    getDescendantsOfType(path, "company"),
    getDescendantsOfType(path, "mall"),
    sectionSlug(path) === "tours"
      ? getDescendantsOfType(path, "tour")
      : Promise.resolve([] as UmbracoItem[]),
  ]);
  const under = (containers: UmbracoItem[], item: UmbracoItem) =>
    containers.some((container) => isUnder(container, item));
  const standaloneCompanies = companies.filter((c) => !under(malls, c));
  const standalonePlaces = places.filter(
    (p) => !under(companies, p) && !under(malls, p),
  );
  return [...tours, ...malls, ...standaloneCompanies, ...standalonePlaces];
}

/** How many entries a listing page shows, from the queries the view itself
 * runs: `generateMetadata` and the page render share one ISR cache entry, so
 * counting costs the metadata pass nothing. */
async function listingCount(path: string): Promise<number> {
  return (await listingEntries(path)).length;
}

/**
 * Sections listed by how many establishments each entry holds, the biggest
 * first. In retail and services the useful answer to "where do I buy this" or
 * "where do I get this done" is the chain with a branch near you, or the plaza
 * with the most shops in it, not the single best-rated shop; elsewhere the
 * rating leads.
 */
const ESTABLISHMENT_COUNT_SECTIONS = new Set([
  "tiendas",
  "empresas-y-servicios",
]);

/** The city section a route path belongs to (`/santo-domingo/tiendas/...`). */
function sectionSlug(path: string): string {
  return canonicalSlug(contentSegments(path)[1] ?? "");
}

/**
 * Listing entries in display order. Companies and malls carry no rating of
 * their own, so they rank by their best-rated nested place — the same
 * parent/branch inheritance listingFacilities uses. Inside
 * `ESTABLISHMENT_COUNT_SECTIONS` the number of establishments leads and the
 * rating only breaks ties, so a place (which holds none) sorts after every
 * chain and every plaza. A plaza holds what hangs from it plus what it only
 * references: an establishment lives in the section that says what it is, so
 * counting its subtree alone would rank the biggest plazas as empty.
 */
async function listingEntriesOrdered(path: string): Promise<UmbracoItem[]> {
  const [entries, allPlaces] = await Promise.all([
    listingEntries(path),
    getDescendantsOfType(path, "place"),
  ]);
  const nested = new Map(
    entries.map((entry) => {
      if (entry.contentType === "place") {
        return [entry.id, [] as UmbracoItem[]] as const;
      }
      const prefix = `${entry.route.path.replace(/\/+$/, "")}/`;
      return [
        entry.id,
        allPlaces.filter((p) => p.route.path.startsWith(prefix)),
      ] as const;
    }),
  );
  const ratedBy = new Map(
    entries.map(
      (entry) =>
        [
          entry.id,
          [entry, ...nested.get(entry.id)!].sort(byRating)[0],
        ] as const,
    ),
  );
  // The picker comes back unexpanded here (name and route only), which is all a
  // count needs; an establishment already under the plaza is not counted twice.
  const held = new Map(
    entries.map((entry) => {
      const prefix = `${entry.route.path.replace(/\/+$/, "")}/`;
      const referenced = picked(entry, "establishments").filter(
        (e) => !e.route.path.startsWith(prefix),
      );
      return [
        entry.id,
        nested.get(entry.id)!.length + referenced.length,
      ] as const;
    }),
  );
  const byEstablishmentCount = ESTABLISHMENT_COUNT_SECTIONS.has(
    sectionSlug(path),
  );
  return [...entries].sort((a, b) => {
    if (byEstablishmentCount) {
      const diff = held.get(b.id)! - held.get(a.id)!;
      if (diff !== 0) return diff;
    }
    return byRating(ratedBy.get(a.id)!, ratedBy.get(b.id)!);
  });
}

/** Category pages that offer the "Facilidades" dropdown filter. */
const FACILITY_FILTER_SLUGS = new Set([
  "restaurantes",
  "bares-y-clubes",
  "tiendas",
  "empresas-y-servicios",
]);

/**
 * Having a menu on the portal is offered inside the "Facilidades" dropdown, as
 * one more thing a visitor picks a restaurant by — but it is not a facility the
 * CMS stores, so it travels as a value of its own, lowercase where the stored
 * vocabulary is capitalised Spanish and therefore never colliding with one.
 */
const MENU_FILTER_VALUE = "menu";

/**
 * Facilities each listing entry can be filtered by: a place's own facilities
 * plus the menu pseudo-facility; for companies and malls, the union with those
 * of every place nested under them (branches, establishments).
 */
async function listingFacilities(
  path: string,
  entries: UmbracoItem[],
): Promise<Record<string, string[]>> {
  const allPlaces = await getDescendantsOfType(path, "place");
  const valuesOf = (item: UmbracoItem): string[] =>
    hasMenu(item) ? [...facilities(item), MENU_FILTER_VALUE] : facilities(item);
  return Object.fromEntries(
    entries.map((entry) => {
      const own = valuesOf(entry);
      if (entry.contentType === "place") return [entry.id, own];
      const prefix = `${entry.route.path.replace(/\/+$/, "")}/`;
      const nested = allPlaces
        .filter((p) => p.route.path.startsWith(prefix))
        .flatMap(valuesOf);
      return [entry.id, [...new Set([...own, ...nested])]];
    }),
  );
}

/**
 * The "Facilidades" dropdown: the menu first, then the canonical facility
 * order, then the rest. The values are the Spanish keys the CMS stores, so the
 * options carry their own labels — that is what the English page reads, while
 * the URL keeps carrying the key.
 */
async function facilityFilter(
  path: string,
  entries: UmbracoItem[],
): Promise<FilterGroup> {
  const locale = await activeLocale();
  const valuesByEntry = await listingFacilities(path, entries);
  const present = new Set(Object.values(valuesByEntry).flat());
  const known = Object.keys(FACILITY_ICONS).filter((f) => present.has(f));
  const extra = [...present]
    .filter((f) => f !== MENU_FILTER_VALUE && !(f in FACILITY_ICONS))
    .sort((a, b) => a.localeCompare(b, "es"));
  const options = [
    ...(present.has(MENU_FILTER_VALUE) ? [MENU_FILTER_VALUE] : []),
    ...known,
    ...extra,
  ];
  return {
    key: "facilidades",
    label: t(locale).place.filterByFacilities,
    options,
    valuesByEntry,
    // A place must offer every facility that is ticked.
    match: "all",
    icons: { ...FACILITY_ICONS, [MENU_FILTER_VALUE]: "\u{1F37D}" },
    labels: Object.fromEntries(
      options.map((option) => [
        option,
        option === MENU_FILTER_VALUE
          ? t(locale).place.filterWithMenu
          : facilityLabel(locale, option),
      ]),
    ),
  };
}

/**
 * Categories whose subcategories are offered as a multi-select dropdown
 * instead of a pill row, with the label that names them and the glyph each
 * subcategory is listed with.
 */
/**
 * What the subcategory dropdown is called per section — a cuisine under
 * "Restaurantes", a kind of venue under "Bares y Clubes". Every section with
 * subcategories gets the dropdown; only its label changes. Keyed by the Spanish
 * slug, like the rest of the section configuration.
 */
const SUBCATEGORY_FILTER_LABELS: Record<
  string,
  "cuisine" | "venueType" | "shopType" | "serviceType"
> = {
  restaurantes: "cuisine",
  "bares-y-clubes": "venueType",
  tiendas: "shopType",
  "empresas-y-servicios": "serviceType",
};

function subcategoryFilterLabel(
  slug: string | undefined,
  locale: Locale,
): string {
  const words = t(locale).listing;
  const key = SUBCATEGORY_FILTER_LABELS[canonicalSlug(slug ?? "")];
  return key ? words[key] : t(locale).place.category;
}

/**
 * The subcategory dropdown (cuisine type on "Restaurantes", venue kind on
 * "Bares y Clubes", …): an entry's values are the subcategories it sits under,
 * so companies and malls match through the branch that is nested there.
 * Entries hanging straight off the category carry none and drop out once
 * something is ticked.
 */
function subcategoryFilter(
  label: string,
  entries: UmbracoItem[],
  subcategories: UmbracoItem[],
): FilterGroup {
  const valuesByEntry = Object.fromEntries(
    entries.map((entry) => [
      entry.id,
      subcategories.filter((sub) => isUnder(sub, entry)).map((sub) => sub.name),
    ]),
  );
  const present = new Set(Object.values(valuesByEntry).flat());
  return {
    key: "subcategoria",
    label,
    options: subcategories.map((sub) => sub.name).filter((n) => present.has(n)),
    valuesByEntry,
    // Ticking two cuisines widens the listing instead of emptying it.
    match: "any",
    icons: Object.fromEntries(
      subcategories.map((sub) => [sub.name, subcategoryIcon(sub.route.path)]),
    ),
  };
}

/** A located node as a map pin. `logo` is the company logo for a branch. */
function markerOf(
  item: UmbracoItem,
  name: string,
  logo: string | null,
): MapMarker {
  return {
    id: item.id,
    name,
    url: item.route.path,
    address: text(item, "address") || null,
    latitude: num(item, "latitude"),
    longitude: num(item, "longitude"),
    logo,
    photo: photoUrl(item) ?? logo,
    rating: num(item, "googleRating") || null,
    ratingCount: num(item, "googleRatingCount") || null,
  };
}

/** Content without coordinates cannot be mapped. */
const isPlaced = (marker: MapMarker) =>
  marker.latitude !== 0 && marker.longitude !== 0;

/**
 * The pins each listing entry puts on the map view. A place or a mall pins
 * itself; a company has no coordinates of its own, so it pins every branch
 * under it, each drawn with the company logo.
 */
async function listingMarkers(
  path: string,
  entries: UmbracoItem[],
): Promise<Map<string, MapMarker[]>> {
  const allPlaces = await getDescendantsOfType(path, "place");
  return new Map(
    entries.map((entry) => {
      if (entry.contentType !== "company") {
        return [entry.id, [markerOf(entry, entry.name, null)].filter(isPlaced)];
      }
      const prefix = `${entry.route.path.replace(/\/+$/, "")}/`;
      const logo = photoUrl(entry);
      return [
        entry.id,
        allPlaces
          .filter((place) => place.route.path.startsWith(prefix))
          .map((branch) =>
            markerOf(branch, branchDisplayName(branch.name, entry.name), logo),
          )
          .filter(isPlaced),
      ];
    }),
  );
}

/** A listing whose entries are not places and never reach a map. */
const NO_MARKERS = new Map<string, MapMarker[]>();

/**
 * A listing, settled on the server: the dropdowns the query string has ticked
 * narrow the entries, the page it asks for takes twelve of them, and only
 * those twelve are drawn. The map view draws none — it wants the pins of every
 * entry the filters kept, and the cards would only be weight nobody sees.
 *
 * `card` says how one entry is rendered, which is the only thing the three
 * listings of the portal disagree about (a place card, an attraction card, a
 * branch card qualified with its company).
 */
function Listing({
  name,
  locale,
  basePath,
  query,
  entries,
  groups = [],
  markersById,
  card,
  emptyLabel,
  gridClassName,
}: {
  /** The listing's own name, for its ItemList. */
  name: string;
  locale: Locale;
  basePath: string;
  query: ListingQuery;
  entries: UmbracoItem[];
  groups?: FilterGroup[];
  markersById: Map<string, MapMarker[]>;
  card: (entry: UmbracoItem) => ReactNode;
  emptyLabel?: string;
  gridClassName?: string;
}) {
  const filters = groups.filter((group) => group.options.length > 0);
  const selected = selectedFilters(filters, query);
  const shown = filterEntries(entries, filters, selected);
  const { page, pageCount } = listingPage(shown.length, query);
  const view: ListingView = query.vista === "mapa" ? "mapa" : "lista";
  const onMap = view === "mapa";
  const drawn = pageEntries(shown, page);

  return (
    <>
      {/* The ItemList describes the page it is on, not the whole section:
          twelve entries, numbered from where this page starts. */}
      <JsonLd
        data={itemListJsonLd(name, drawn, (page - 1) * LISTING_PAGE_SIZE + 1)}
      />
      <ListingViews
        cards={onMap ? null : drawn.map(card)}
        pagination={
          onMap ? null : (
            <ListingPagination
              locale={locale}
              basePath={basePath}
              query={query}
              page={page}
              pageCount={pageCount}
            />
          )
        }
        markers={
          onMap ? shown.flatMap((entry) => markersById.get(entry.id) ?? []) : []
        }
        hasMap={entries.some(
          (entry) => (markersById.get(entry.id)?.length ?? 0) > 0,
        )}
        filters={filters.map(({ key, label, options, icons, labels }) => ({
          key,
          label,
          options,
          icons,
          labels,
        }))}
        selected={selected}
        view={view}
        total={shown.length}
        overall={entries.length}
        emptyLabel={emptyLabel}
        gridClassName={gridClassName}
      />
    </>
  );
}

/**
 * Sections listed with the photo card of the guide instead of the place card:
 * what they hold is an outing, not an address to look up.
 */
const PHOTO_CARD_SECTIONS = new Set(["atracciones", "tours"]);

/**
 * The card one entry of a listing is drawn with. An excursion carries its own —
 * what is picked there is a day, so the card says how long it takes, whether they
 * come for you and what it costs; an outing takes the guide's photo card; anything
 * else is a place, with its address and its rating.
 */
function listingCard(
  entry: UmbracoItem,
  locale: Locale,
  photoCard: boolean,
): ReactNode {
  if (entry.contentType === "tour") {
    return <TourCard key={entry.id} tour={entry} locale={locale} />;
  }
  return photoCard ? (
    <AttractionCard key={entry.id} place={entry} compact locale={locale} />
  ) : (
    <PlaceCard key={entry.id} place={entry} locale={locale} />
  );
}

/** The grid a listing of photo cards uses: three across on a wide screen. */
const PHOTO_CARD_GRID = "mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3";

async function CategoryView({
  item,
  citySlug,
  query,
  fecha,
}: {
  item: UmbracoItem;
  citySlug?: string;
  query: ListingQuery;
  fecha?: string;
}) {
  const locale = await activeLocale();
  const [children, entries, city] = await Promise.all([
    getChildren(item.route.path),
    listingEntriesOrdered(item.route.path),
    cityOf(item),
  ]);
  const subcategories = children.filter((c) => c.contentType === "subcategory");
  const categorySlug = canonicalSlug(
    item.route.path.split("/").filter(Boolean).pop() ?? "",
  );
  const showCartelera =
    categorySlug === "cines" && !!citySlug && citySlug in CINEMAS_BY_CITY;
  const subcategoryLabel = subcategoryFilterLabel(categorySlug, locale);
  const subFilter =
    subcategories.length > 0
      ? subcategoryFilter(subcategoryLabel, entries, subcategories)
      : null;
  const filters: FilterGroup[] = [
    ...(FACILITY_FILTER_SLUGS.has(categorySlug)
      ? [await facilityFilter(item.route.path, entries)]
      : []),
    ...(subFilter ? [subFilter] : []),
  ];
  const markers = await listingMarkers(item.route.path, entries);
  // Attractions use the photo card "Qué Hacer" shows, three across on a wide
  // screen, instead of the two-column place card the other sections list. Tours
  // read the same way: what is picked there is a plan for the day, and the
  // picture is what tells one excursion from another.
  const showsAttractions = PHOTO_CARD_SECTIONS.has(categorySlug);
  // The editor's introduction, else the derived lead — what the page holds,
  // which is also its meta description.
  const lead =
    text(item, "intro") ||
    listingLead({
      name: item.name,
      cityName: city?.name,
      count: entries.length,
      locale,
      named: false,
    });

  return (
    <PageShell item={item}>
      <h1 className="mt-4 text-3xl font-bold">{item.name}</h1>
      {lead && <p className="mt-2 max-w-2xl text-neutral-600">{lead}</p>}
      {showCartelera && (
        <Cartelera
          citySlug={citySlug!}
          basePath={item.route.path}
          selectedDate={fecha}
          locale={locale}
        />
      )}
      {/* The cartelera stands on its own when the section has no places yet. */}
      {(entries.length > 0 || !showCartelera) && (
        <Listing
          name={item.name}
          locale={locale}
          basePath={item.route.path}
          query={query}
          entries={entries}
          groups={filters}
          markersById={markers}
          card={(entry) => listingCard(entry, locale, showsAttractions)}
          gridClassName={showsAttractions ? PHOTO_CARD_GRID : undefined}
        />
      )}
      {/* The links to the subcategories close the page, under the pagination:
          the dropdown above narrows this listing in place and these leave it,
          so the two are no longer read as one duplicated control. A crawler
          finds them wherever they sit — what matters is that they are links. */}
      <SubcategoryLinks
        label={t(locale).listing.goToCategory}
        subcategories={subcategories}
        entries={entries}
      />
    </PageShell>
  );
}

/**
 * A movie's own page: the agent-maintained catalog entry (poster, sinopsis,
 * trailer, IMDb / Rotten Tomatoes scores) over the live Caribbean Cinemas
 * showings — every cinema in the city presenting it on the chosen date, with
 * booking links and a map of those cinemas. Date via ?fecha=YYYY-MM-DD.
 */
/**
 * La ficha de una excursión: la foto del sitio adonde va, lo que hay que saber antes
 * de apartarle el día — cuánto dura, si pasan a buscarte, en qué temporada se hace —,
 * qué cubre el precio y quién la lleva.
 *
 * Nada se reserva aquí: el portal traslada la solicitud y la confirma el operador,
 * que es lo mismo que promete el formulario de una mesa y por eso es el mismo, con
 * las frases de una excursión. El operador es un nodo del propio portal — vive en la
 * sección que dice lo que es, "Atracciones" o "Empresas y Servicios" — así que se
 * enlaza en vez de repetirse.
 */
async function TourView({ item }: { item: UmbracoItem }) {
  const locale = await activeLocale();
  const words = t(locale).tours;
  // The operators are a picker, and the route fetch does not expand it: without
  // this the list of who runs the excursion comes back empty.
  const expanded = await getItem(item.route.path, "properties[operators]");
  const citySlug = contentSegments(item.route.path)[0] ?? "";
  const own = photoOf(item);
  const photo =
    own?.url ??
    curatedPhoto(citySlug, slugOf(item)) ??
    sectionListImage(item.route.path);
  const photoBox = photoBoxAspect(own) ?? 16 / 9;
  // Las fotos curadas son de Commons y sus licencias piden crédito; una foto puesta
  // en el backoffice es del portal y no lleva ninguno.
  const credit = own ? null : curatedPhotoCredit(citySlug, slugOf(item));
  const meta = tourMeta(item, locale, words);
  const price = priceLabel(item, locale);
  const included = includedItems(item);
  const operators = tourOperators(expanded ?? item);
  const meetingPoint = text(item, "meetingPoint");
  const booking = text(item, "bookingUrl");

  return (
    <PageShell item={item}>
      <JsonLd data={tourJsonLd(expanded ?? item, photo, locale)} />
      <div className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-2">
        <h1 className="text-3xl font-bold">{item.name}</h1>
        <ShareButtons
          url={absoluteUrl(item.route.path)}
          title={item.name}
          className="sm:ml-auto"
        />
      </div>
      {meta.length > 0 && (
        <p className="mt-2 text-sm text-neutral-500">{meta.join(" · ")}</p>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div>
          <div
            className="relative overflow-hidden rounded-xl bg-neutral-200"
            style={{ aspectRatio: photoBox }}
          >
            <PhotoFit
              src={photo}
              alt={item.name}
              width={own?.width}
              height={own?.height}
              box={photoBox}
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority
            />
          </div>
          {credit && (
            <p className="mt-1 text-right text-[11px] text-neutral-400">
              {words.photoCredit(credit)}
            </p>
          )}
          {text(item, "description") && (
            <p className="mt-5 whitespace-pre-line text-neutral-700">
              {text(item, "description")}
            </p>
          )}
          {included.length > 0 && (
            <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
              <h2 className="font-semibold">{words.includes}</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-neutral-700">
                {included.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden className="text-brand-600">
                      ✓
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {meetingPoint && (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-5">
              <h2 className="font-semibold">{words.meetingPoint}</h2>
              <p className="mt-1 text-sm text-neutral-600">{meetingPoint}</p>
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-neutral-200 bg-white p-5">
          <p className="text-lg font-semibold text-brand-700">
            {price ? words.priceFrom(price) : words.priceOnRequest}
          </p>
          {acceptsReservations(item) && (
            <div className="mt-4">
              <ReservationDialog
                placeId={item.id}
                placeName={item.name}
                placeUrl={item.route.path}
                minDate={todayInDR()}
                locale={locale}
                variant="tour"
              />
            </div>
          )}
          {booking && (
            <a
              href={booking}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block rounded-xl border border-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              {words.bookWithOperator}
            </a>
          )}
          {operators.length > 0 && (
            <div className="mt-5 border-t border-neutral-200 pt-4">
              <h2 className="text-sm font-semibold">{words.operators}</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {operators.map((operator) => (
                  <li key={operator.id}>
                    <Link
                      href={operator.route.path}
                      className="text-brand-700 hover:underline"
                    >
                      {operator.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-xs text-neutral-500">{words.operatorsHint}</p>
        </aside>
      </div>
    </PageShell>
  );
}

async function MovieView({
  item,
  citySlug,
  fecha,
}: {
  item: UmbracoItem;
  citySlug: string;
  fecha?: string;
}) {
  const poster = text(item, "posterUrl");
  const trailer = text(item, "trailerYoutubeId");
  const reviews = movieReviews(item);
  const meta = [
    text(item, "rating"),
    text(item, "duration") && `${text(item, "duration")} min`,
    text(item, "genre"),
  ].filter(Boolean);

  const locale = await activeLocale();
  const today = todayInDR();
  const dates = await getAvailableDates(cinemaSiteIds(citySlug));
  const date = fecha && dates.includes(fecha) ? fecha : (dates[0] ?? today);
  const cinemas = await getMovieShowings(citySlug, item.name, date, locale);
  const showtimes = cinemas.reduce((sum, c) => sum + c.showtimes.length, 0);

  return (
    <PageShell item={item}>
      <JsonLd data={movieJsonLd(item, locale)} />
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt={`Afiche de ${item.name}`}
            className="w-40 flex-none rounded-xl border border-neutral-200 object-cover sm:w-52"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{item.name}</h1>
            {trailer && (
              <TrailerModal youtubeId={trailer} movieName={item.name} />
            )}
            <ShareButtons
              url={absoluteUrl(item.route.path)}
              title={item.name}
              className="sm:ml-auto"
            />
          </div>
          {meta.length > 0 && (
            <p className="mt-2 text-sm text-neutral-500">{meta.join(" · ")}</p>
          )}
          <div className="mt-3">
            <MovieReviewBadges
              movieName={item.name}
              reviews={reviews}
              locale={locale}
            />
          </div>
          {text(item, "synopsis") && (
            <p className="mt-4 max-w-2xl text-neutral-700">
              {text(item, "synopsis")}
            </p>
          )}
          <Link
            href={localizedSectionPath(locale, citySlug, "cines")}
            className="mt-6 inline-block rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:border-brand-500 hover:text-brand-600"
          >
            {t(locale).movies.fullListings}
          </Link>
        </div>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-bold">
            {t(locale).movies.whereToWatch}
          </h2>
          {cinemas.length > 0 && (
            <p className="text-sm text-neutral-500">
              {cinemas.length} {cinemas.length === 1 ? "cine" : "cines"} ·{" "}
              {showtimes} {showtimes === 1 ? "función" : "funciones"}
            </p>
          )}
        </div>
        <DateTabs
          dates={dates}
          selected={date}
          today={today}
          basePath={item.route.path}
          locale={locale}
        />
        {cinemas.length === 0 ? (
          <p className="mt-6 text-neutral-500">
            {t(locale).movies.noShowtimes(item.name)}
          </p>
        ) : (
          <div className="mt-2 rounded-xl border border-neutral-200 bg-white shadow-sm">
            <MovieShowtimes movieName={item.name} cinemas={cinemas} />
          </div>
        )}
      </section>
    </PageShell>
  );
}

async function SubcategoryView({
  item,
  query,
}: {
  item: UmbracoItem;
  query: ListingQuery;
}) {
  const locale = await activeLocale();
  const [entries, city, parent] = await Promise.all([
    listingEntriesOrdered(item.route.path),
    cityOf(item),
    parentOf(item),
  ]);
  const markers = await listingMarkers(item.route.path, entries);
  // A subcategory reads like its section: the kinds of day under "Tours" and the
  // kinds of outing under "Atracciones" are picked by their picture.
  const photoCards = PHOTO_CARD_SECTIONS.has(
    canonicalSlug(contentSegments(item.route.path)[1] ?? ""),
  );
  const lead =
    text(item, "intro") ||
    listingLead({
      name: item.name,
      parentName: parent?.name,
      cityName: city?.name,
      count: entries.length,
      locale,
      named: false,
    });
  return (
    <PageShell item={item}>
      <h1 className="mt-4 text-3xl font-bold">{item.name}</h1>
      {lead && <p className="mt-2 max-w-2xl text-neutral-600">{lead}</p>}
      <Listing
        name={item.name}
        locale={locale}
        basePath={item.route.path}
        query={query}
        entries={entries}
        markersById={markers}
        card={(entry) => listingCard(entry, locale, photoCards)}
        gridClassName={photoCards ? PHOTO_CARD_GRID : undefined}
      />
    </PageShell>
  );
}

/**
 * Mall page: general info header, establishments grouped by their category
 * subcategories (plus ungrouped direct children), the ones that live elsewhere in
 * the tree and are only referenced from here, and the location map.
 */
/** One heading of a plaza page: a category and the establishments filed under it. */
type MallGroup = {
  key: string;
  label: string;
  /** Content path the heading takes its glyph from. */
  path: string;
  order: number;
  entries: { item: UmbracoItem; company: UmbracoItem | null }[];
};

/** Last segment of a content path, which is how every category is keyed here. */
function lastSegment(path: string): string {
  return path.replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? "";
}

/**
 * The establishments of a plaza under one heading per category: the groups the
 * plaza owns ("Moda", "Comida") merged with the categories of the places it only
 * references, so every bank lands under "Bancos" and every restaurant under
 * "Restaurantes" however each one is filed in the tree. The plaza's own groups
 * lead, in the order the backoffice gives them, and the rest follow the city's
 * section order. A place parented straight by the plaza carries no category to
 * read, so it closes the page under "Otros establecimientos".
 */
async function mallEstablishmentGroups(
  mall: UmbracoItem,
  children: UmbracoItem[],
  referenced: UmbracoItem[],
  city: UmbracoItem | null,
): Promise<MallGroup[]> {
  const locale = await activeLocale();
  const sections = city ? await getChildren(city.route.path) : [];
  const sectionOrder = new Map(
    sections.map(
      (section, index) => [lastSegment(section.route.path), index] as const,
    ),
  );
  const own = children.filter((c) => c.contentType === "subcategory");
  const [ownEntries, referencedInfo] = await Promise.all([
    Promise.all(own.map((group) => listingEntriesOrdered(group.route.path))),
    // A referenced branch carries only its local name ("Sucursal Ágora Mall"), and on
    // a plaza page the chain is what identifies it, so its company comes along — the
    // same one the card would inherit the logo from inside the company's own page.
    Promise.all(
      referenced.map(async (entry) => {
        const path = categoryPath(entry.route.path);
        const parentPath = entry.route.path
          .replace(/\/+$/, "")
          .split("/")
          .slice(0, -1)
          .join("/");
        const [category, parent] = await Promise.all([
          getItem(path),
          parentPath ? getItem(parentPath) : Promise.resolve(null),
        ]);
        return {
          entry,
          path,
          label: category?.name ?? lastSegment(path),
          company: parent?.contentType === "company" ? parent : null,
        };
      }),
    ),
  ]);

  const groups = new Map<string, MallGroup>();
  const groupFor = (
    key: string,
    label: string,
    path: string,
    order: number,
  ) => {
    const existing = groups.get(key);
    if (existing) return existing;
    const created: MallGroup = { key, label, path, order, entries: [] };
    groups.set(key, created);
    return created;
  };

  own.forEach((group, index) => {
    groupFor(
      lastSegment(group.route.path),
      group.name,
      group.route.path,
      index,
    ).entries.push(
      ...ownEntries[index].map((entry) => ({ item: entry, company: null })),
    );
  });

  for (const { entry, path, label, company } of referencedInfo) {
    const order =
      own.length +
      (sectionOrder.get(contentSegments(path)[1] ?? "") ?? sections.length);
    groupFor(lastSegment(path), label, path, order).entries.push({
      item: entry,
      company,
    });
  }

  const loose = children.filter(
    (c) => c.contentType === "place" || c.contentType === "company",
  );
  if (loose.length > 0) {
    groupFor(
      "otros",
      t(locale).place.establishments,
      mall.route.path,
      own.length + sections.length + 1,
    ).entries.push(...loose.map((entry) => ({ item: entry, company: null })));
  }

  return [...groups.values()]
    .filter((group) => group.entries.length > 0)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "es"));
}

async function MallView({ item }: { item: UmbracoItem }) {
  const locale = await activeLocale();
  // A bank branch belongs under its company and a restaurant under its cuisine, so
  // the plaza points at them instead of holding them; expanding the picker brings
  // their photo and rating along, which the cards need.
  const [children, expanded, cityItem] = await Promise.all([
    getChildren(item.route.path),
    getItem(item.route.path, "properties[establishments]"),
    cityOf(item),
  ]);
  const mallPath = item.route.path.replace(/\/+$/, "");
  const referenced = picked(expanded ?? item, "establishments")
    .filter((entry) => !entry.route.path.startsWith(`${mallPath}/`))
    .sort(byRating);
  const groups = await mallEstablishmentGroups(
    item,
    children,
    referenced,
    cityItem,
  );
  const own = photoOf(item);
  const photo = own?.url ?? null;
  const website = text(item, "website");
  const directions = itemDirectionsUrl(item);
  const latitude = num(item, "latitude");
  const longitude = num(item, "longitude");

  return (
    <PageShell item={item}>
      <JsonLd
        data={placeJsonLd({
          item,
          cityName: cityItem?.name ?? "",
          country: text(cityItem ?? item, "country"),
          image: photo,
          type: "ShoppingCenter",
        })}
      />
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="relative h-32 w-32 flex-none overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <PhotoFit
            src={photo ?? sectionListImage(item.route.path)}
            alt={item.name}
            width={own?.width}
            height={own?.height}
            box={1}
            sizes="128px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{item.name}</h1>
            {directions && <DirectionsLink href={directions} locale={locale} />}
            <ShareButtons
              url={absoluteUrl(item.route.path)}
              title={item.name}
              className="sm:ml-auto"
            />
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            {text(item, "address") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.address}
                </dt>
                <dd className="text-neutral-700">{text(item, "address")}</dd>
              </div>
            )}
            {text(item, "phone") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.phone}
                </dt>
                <dd className="text-neutral-700">{text(item, "phone")}</dd>
              </div>
            )}
            {website && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.website}
                </dt>
                <dd>
                  <a
                    href={website}
                    className="text-brand-600 hover:underline"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {website}
                  </a>
                </dd>
              </div>
            )}
            {text(item, "hours") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.hours}
                </dt>
                <dd className="whitespace-pre-line text-neutral-700">
                  {text(item, "hours")}
                </dd>
              </div>
            )}
          </dl>
          {text(item, "description") && (
            <p className="mt-4 max-w-2xl whitespace-pre-line text-neutral-700">
              {text(item, "description")}
            </p>
          )}
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.key} className="mt-10">
          <h2 className="text-lg font-semibold">
            <span aria-hidden className="mr-1.5">
              {subcategoryIcon(group.path)}
            </span>
            {group.label} ({group.entries.length})
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {group.entries.map(({ item: entry, company }) => (
              <PlaceCard
                key={entry.id}
                place={entry}
                company={company}
                fallbackPhoto={company ? photoUrl(company) : null}
                locale={locale}
              />
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <p className="mt-10 text-neutral-500">
          {t(locale).place.establishmentsEmpty}
        </p>
      )}

      {latitude !== 0 && longitude !== 0 && (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {t(locale).place.location}
            </h2>
            {directions && (
              <DirectionsLink
                href={directions}
                variant="link"
                locale={locale}
              />
            )}
          </div>
          <div className="mt-4">
            <PlaceMap
              id={item.id}
              name={item.name}
              latitude={latitude}
              longitude={longitude}
              photo={mapPinIcon(item.route.path)}
            />
          </div>
        </section>
      )}
    </PageShell>
  );
}

async function CompanyView({
  item,
  query,
}: {
  item: UmbracoItem;
  query: ListingQuery;
}) {
  const locale = await activeLocale();
  const children = await getChildren(item.route.path);
  const logo = photoUrl(item);
  const branches = children.filter((c) => c.contentType === "place");
  const website = text(item, "website");
  // A branch pins itself, drawn with the company logo like everywhere else.
  const branchMarkers = new Map(
    branches.map((branch) => [
      branch.id,
      [
        markerOf(branch, branchDisplayName(branch.name, item.name), logo),
      ].filter(isPlaced),
    ]),
  );
  const cityItem = await cityOf(item);

  return (
    <PageShell item={item}>
      <JsonLd
        data={organizationJsonLd(
          item,
          branches,
          cityItem?.name ?? "",
          text(cityItem ?? item, "country"),
        )}
      />
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="relative h-32 w-32 flex-none overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <Image
            src={logo ?? sectionListImage(item.route.path)}
            alt={`Logo ${item.name}`}
            fill
            className={logo ? "object-contain p-2" : "object-cover"}
            sizes="128px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{item.name}</h1>
            <ShareButtons
              url={absoluteUrl(item.route.path)}
              title={item.name}
              className="sm:ml-auto"
            />
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            {text(item, "phone") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.phone}
                </dt>
                <dd className="text-neutral-700">{text(item, "phone")}</dd>
              </div>
            )}
            {website && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.website}
                </dt>
                <dd>
                  <a
                    href={website}
                    className="text-brand-600 hover:underline"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {website}
                  </a>
                </dd>
              </div>
            )}
            {text(item, "hours") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.hours}
                </dt>
                <dd className="whitespace-pre-line text-neutral-700">
                  {text(item, "hours")}
                </dd>
              </div>
            )}
          </dl>
          {text(item, "description") && (
            <p className="mt-4 max-w-2xl whitespace-pre-line text-neutral-700">
              {text(item, "description")}
            </p>
          )}
        </div>
      </div>

      <h2 className="mt-10 text-lg font-semibold">
        Sucursales {branches.length > 0 && `(${branches.length})`}
      </h2>
      <Listing
        name={item.name}
        locale={locale}
        basePath={item.route.path}
        query={query}
        entries={branches}
        markersById={branchMarkers}
        card={(branch) => (
          <PlaceCard
            key={branch.id}
            place={branch}
            fallbackPhoto={logo}
            company={item}
            locale={locale}
          />
        )}
        emptyLabel={t(locale).place.branchesEmpty}
      />
    </PageShell>
  );
}

async function PlaceView({ item }: { item: UmbracoItem }) {
  const locale = await activeLocale();
  const latitude = num(item, "latitude");
  const longitude = num(item, "longitude");
  const parentPath = `/${item.route.path.split("/").filter(Boolean).slice(0, -1).join("/")}`;
  const parent = await getItem(parentPath);
  const categoryName = parent?.name ?? "";

  // A branch place inherits general info (logo, phone, website, hours,
  // description) from its parent company when it has no own value.
  const company = parent?.contentType === "company" ? parent : null;
  const inherited = (alias: string) =>
    text(item, alias) || (company ? text(company, alias) : "");
  // "Oficina Principal" or "Sucursal Naco" says nothing on its own: a branch is
  // shown under its company's name unless it already carries it.
  const displayName = branchDisplayName(item.name, company?.name);
  // La galería es el extra de los lugares que encabezan su sección: va al lado de la
  // foto principal, y con menos de cuatro fotos no hay rejilla que rote.
  const gallery = photosOf(item, "gallery");
  const hasGallery = gallery.length >= 4;
  // La carta va junto al horario: es lo mismo que el horario, algo que se consulta
  // antes de ir. Una sola página ya es un menú — hay restaurantes cuya carta cabe en
  // una hoja — así que basta con tener alguna.
  const menu = photosOf(item, "menu");
  const menuSections = placeMenu(item, locale);
  // El día que el portal leyó la carta, no el día del menú: con la fecha delante, y la
  // advertencia al lado, un precio viejo se lee por lo que es.
  const menuCaptured =
    formatDate(item.properties["menuUpdated"], locale) || null;
  const own = photoOf(item);
  const ownPhoto = own?.url ?? null;
  const inheritedPhoto = ownPhoto ?? (company ? photoUrl(company) : null);
  // No photo and no company logo: fall back to the section's image.
  const photo = inheritedPhoto ?? sectionListImage(item.route.path);
  // An inherited company logo is letterboxed with a soft border instead of
  // being cropped to the square like a real photo.
  const isLogo = inheritedPhoto !== null && ownPhoto === null;
  const photoBox = isLogo ? 1 : photoBoxAspect(own);
  const website = inherited("website");
  const directions = itemDirectionsUrl(item, displayName);
  const cityItem = await cityOf(item);

  return (
    <PageShell item={item}>
      <JsonLd
        data={placeJsonLd({
          item,
          name: displayName,
          cityName: cityItem?.name ?? "",
          country: text(cityItem ?? item, "country"),
          description: inherited("description"),
          phone: inherited("phone"),
          website,
          hours: inherited("hours"),
          image: inheritedPhoto,
          menu: menuSections,
        })}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{displayName}</h1>
        {directions && <DirectionsLink href={directions} locale={locale} />}
        <ShareButtons
          url={absoluteUrl(item.route.path)}
          title={displayName}
          className="sm:ml-auto"
        />
      </div>
      <div className="mt-1">
        <Rating place={item} locale={locale} />
      </div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[14rem_1fr]">
        <div>
          <div
            className={`relative overflow-hidden rounded-xl ${
              isLogo ? "border border-neutral-200 bg-white" : "bg-neutral-200"
            }`}
            // La foto manda sobre su propio alto: la columna de la ficha no tiene
            // que cuadrar con nada al lado, así que la caja toma la forma de la
            // foto y no le corta nada.
            style={{ aspectRatio: photoBox ?? 1 }}
          >
            {isLogo ? (
              <Image
                src={photo}
                alt={displayName}
                fill
                unoptimized={photo.endsWith(".svg")}
                className="object-contain p-6"
                sizes="(min-width: 1024px) 14rem, 100vw"
                priority
              />
            ) : (
              <PhotoFit
                src={photo}
                alt={displayName}
                width={own?.width}
                height={own?.height}
                box={photoBox ?? 1}
                sizes="(min-width: 1024px) 14rem, 100vw"
                priority
              />
            )}
          </div>
          {/* Reservar encabeza la columna: es lo que alguien viene a hacer, y el horario
              y la carta son lo que consulta antes. Solo el valor propio del nodo — leer
              el de la empresa mandaría la reserva de una sucursal al correo de la cadena. */}
          {acceptsReservations(item) && (
            <div className="mt-4">
              <ReservationDialog
                placeId={item.id}
                placeName={displayName}
                placeUrl={item.route.path}
                minDate={todayInDR()}
                locale={locale}
              />
            </div>
          )}
          {inherited("hours") && (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
              <h2 className="font-semibold">{t(locale).place.hours}</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-neutral-600">
                {inherited("hours")}
              </p>
            </div>
          )}
          {menu.length > 0 && (
            <div className="mt-4">
              <MenuViewer
                pages={menu}
                name={displayName}
                source={text(item, "menuSource") || null}
                captured={menuCaptured}
              />
            </div>
          )}
          {menuSections.length > 0 && (
            <div className="mt-4">
              <MenuDialog
                sections={menuSections}
                source={text(item, "menuSource") || null}
                captured={menuCaptured}
              />
            </div>
          )}
        </div>

        {/* Al lado de la foto: lo que el lugar dice, y la galería a su derecha. */}
        <div
          className={
            hasGallery ? "grid gap-6 lg:grid-cols-2 lg:items-start" : undefined
          }
        >
          <div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.address}
                </dt>
                <dd className="text-neutral-700">{text(item, "address")}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {company ? t(locale).place.company : t(locale).place.category}
                </dt>
                <dd className="text-neutral-700">
                  {parent ? (
                    <Link
                      href={parent.route.path}
                      className="hover:text-brand-600 hover:underline"
                    >
                      {categoryName}
                    </Link>
                  ) : (
                    categoryName
                  )}
                </dd>
              </div>
              {inherited("phone") && (
                <div className="flex gap-2">
                  <dt className="font-semibold text-brand-700">
                    {t(locale).place.phone}
                  </dt>
                  <dd className="text-neutral-700">{inherited("phone")}</dd>
                </div>
              )}
              {website && (
                <div className="flex gap-2">
                  <dt className="font-semibold text-brand-700">
                    {t(locale).place.website}
                  </dt>
                  <dd>
                    <a
                      href={website}
                      className="text-brand-600 hover:underline"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {website}
                    </a>
                  </dd>
                </div>
              )}
            </dl>

            {inherited("description") && (
              <>
                <h2 className="mt-6 text-lg font-semibold">
                  {t(locale).place.about(company ? company.name : item.name)}
                </h2>
                <p className="mt-2 whitespace-pre-line text-neutral-700">
                  {inherited("description")}
                </p>
              </>
            )}

            {facilities(item).length > 0 && (
              <>
                <h2 className="mt-6 text-lg font-semibold">
                  {t(locale).place.facilities}
                </h2>
                <div className="mt-3">
                  <FacilityBadges
                    facilities={facilities(item)}
                    locale={locale}
                  />
                </div>
              </>
            )}
          </div>

          {hasGallery && (
            <PhotoGallery
              photos={gallery}
              name={displayName}
              label={t(locale).place.gallery}
            />
          )}
        </div>
      </div>

      {latitude !== 0 && longitude !== 0 && (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t(locale).place.map}</h2>
            {directions && (
              <DirectionsLink
                href={directions}
                variant="link"
                locale={locale}
              />
            )}
          </div>
          <div className="mt-4">
            <PlaceMap
              id={item.id}
              name={displayName}
              latitude={latitude}
              longitude={longitude}
              photo={mapPinIcon(
                item.route.path,
                company ? photoUrl(company) : null,
              )}
            />
          </div>
        </section>
      )}
    </PageShell>
  );
}

function formatDate(value: unknown, locale: Locale): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: "long",
  }).format(date);
}

async function EventsView({
  item,
  query,
}: {
  item: UmbracoItem;
  query: ListingQuery;
}) {
  const locale = await activeLocale();
  const words = t(locale);
  const events = await getChildren(item.route.path);
  const byId = new Map(events.map((event) => [event.id, event]));
  const entries: EventEntry[] = events
    .map((event) => eventEntry(event))
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

  const categories = [
    ...new Set(entries.map((entry) => entry.category).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, INTL_LOCALE[locale]));
  // One category each, so ticking two widens the listing instead of emptying it.
  const groups: FilterGroup[] =
    categories.length > 1
      ? [
          {
            key: "categoria",
            label: words.map.category,
            options: categories,
            valuesByEntry: Object.fromEntries(
              entries.map((entry) => [
                entry.id,
                entry.category ? [entry.category] : [],
              ]),
            ),
            match: "any",
            icons: Object.fromEntries(
              categories.map((category) => [
                category,
                eventCategoryIcon(category),
              ]),
            ),
          },
        ]
      : [];
  const selected = selectedFilters(groups, query);
  const shown = filterEntries(entries, groups, selected);
  // What is still to come, in date order, and then what is over: the order the
  // page has always read in, and the order the pages cut through.
  const ordered = [
    ...shown.filter((entry) => !isPastEvent(entry)),
    ...shown.filter(isPastEvent),
  ];
  const { page, pageCount } = listingPage(ordered.length, query);
  const drawn = pageEntries(ordered, page);
  const view: ListingView = query.vista === "mapa" ? "mapa" : "lista";

  const byMonth = new Map<string, EventEntry[]>();
  for (const event of drawn.filter((entry) => !isPastEvent(entry))) {
    const label = monthLabel(event.startDate, locale);
    const group = byMonth.get(label);
    if (group) group.push(event);
    else byMonth.set(label, [event]);
  }
  const past = drawn.filter(isPastEvent);

  return (
    <PageShell item={item}>
      <JsonLd
        data={itemListJsonLd(
          item.name,
          drawn.flatMap((entry) => {
            const event = byId.get(entry.id);
            return event ? [event] : [];
          }),
          (page - 1) * LISTING_PAGE_SIZE + 1,
        )}
      />
      <h1 className="mt-4 text-3xl font-bold">{words.map.events}</h1>
      <ListingViews
        cards={
          view === "mapa" ? null : (
            <>
              {[...byMonth.entries()].map(([label, group]) => (
                <section key={label} className="mt-8">
                  <h2 className="text-lg font-semibold text-neutral-800">
                    {label}
                  </h2>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {group.map((event) => (
                      <EventCard key={event.id} event={event} locale={locale} />
                    ))}
                  </div>
                </section>
              ))}
              {past.length > 0 && (
                <section className="mt-10">
                  <h2 className="text-lg font-semibold text-neutral-500">
                    {words.events.past}
                  </h2>
                  <div className="mt-4 grid gap-4 opacity-70 md:grid-cols-2">
                    {past.map((event) => (
                      <EventCard key={event.id} event={event} locale={locale} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )
        }
        pagination={
          <ListingPagination
            locale={locale}
            basePath={item.route.path}
            query={query}
            page={page}
            pageCount={pageCount}
          />
        }
        markers={view === "mapa" ? eventMarkers(shown) : []}
        hasMap={eventMarkers(entries).length > 0}
        filters={groups.map(({ key, label, options, icons, labels }) => ({
          key,
          label,
          options,
          icons,
          labels,
        }))}
        selected={selected}
        view={view}
        total={ordered.length}
        overall={entries.length}
        emptyLabel={words.events.empty}
        noMatchesLabel={words.events.noMatches}
        gridClassName=""
      />
    </PageShell>
  );
}

async function EventView({ item }: { item: UmbracoItem }) {
  const locale = await activeLocale();
  const latitude = num(item, "latitude");
  const longitude = num(item, "longitude");
  const own = photoOf(item);
  const photo = own?.url ?? null;
  const photoBox = photoBoxAspect(own) ?? 1;
  const website = text(item, "website");
  const phone = text(item, "phone");
  // The route is to the venue, which is what the event's address describes.
  const directions = itemDirectionsUrl(
    item,
    text(item, "venueName") || item.name,
  );
  const dates = `${formatDate(item.properties["startDate"], locale)}${
    item.properties["endDate"]
      ? ` — ${formatDate(item.properties["endDate"], locale)}`
      : ""
  }`;
  // A weekly event's date is the next night it falls on, not the only one: the
  // rule leads and the date follows it as the next occasion.
  const repeats = recurrenceLabel(text(item, "recurrence"), locale);
  const cityItem = await cityOf(item);

  return (
    <PageShell item={item}>
      <JsonLd
        data={eventJsonLd(
          item,
          cityItem?.name ?? "",
          text(cityItem ?? item, "country"),
          locale,
        )}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{item.name}</h1>
        {directions && <DirectionsLink href={directions} locale={locale} />}
        <ShareButtons
          url={absoluteUrl(item.route.path)}
          title={item.name}
          className="sm:ml-auto"
        />
      </div>
      {text(item, "category") && (
        <span className="mt-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800">
          {text(item, "category")}
        </span>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[20rem_1fr]">
        <div>
          <div
            className="relative overflow-hidden rounded-xl bg-neutral-200"
            style={{ aspectRatio: photoBox }}
          >
            {photo ? (
              <PhotoFit
                src={photo}
                alt={item.name}
                width={own?.width}
                height={own?.height}
                box={photoBox}
                sizes="(min-width: 1024px) 20rem, 100vw"
                priority
              />
            ) : (
              <div
                className="flex h-full items-center justify-center text-6xl"
                aria-hidden
              >
                🎟️
              </div>
            )}
          </div>
          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="font-semibold">{t(locale).place.date}</h2>
            {repeats && (
              <p className="mt-1 text-sm font-medium text-brand-700">{repeats}</p>
            )}
            <p className="mt-1 text-sm text-neutral-600">{dates}</p>
          </div>
        </div>

        <div>
          <dl className="space-y-1.5 text-sm">
            {text(item, "venueName") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.venue}
                </dt>
                <dd className="text-neutral-700">{text(item, "venueName")}</dd>
              </div>
            )}
            {text(item, "address") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.address}
                </dt>
                <dd className="text-neutral-700">{text(item, "address")}</dd>
              </div>
            )}
            {phone && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).place.phone}
                </dt>
                <dd className="text-neutral-700">{phone}</dd>
              </div>
            )}
            {website && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">
                  {t(locale).events.tickets}
                </dt>
                <dd>
                  <a
                    href={website}
                    className="text-brand-600 hover:underline"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {website}
                  </a>
                </dd>
              </div>
            )}
          </dl>

          {text(item, "description") && (
            <>
              <h2 className="mt-6 text-lg font-semibold">
                {t(locale).events.about}
              </h2>
              <p className="mt-2 whitespace-pre-line text-neutral-700">
                {text(item, "description")}
              </p>
            </>
          )}
        </div>
      </div>

      {latitude !== 0 && longitude !== 0 && (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t(locale).place.map}</h2>
            {directions && (
              <DirectionsLink
                href={directions}
                variant="link"
                locale={locale}
              />
            )}
          </div>
          <div className="mt-4">
            <PlaceMap
              id={item.id}
              name={item.name}
              latitude={latitude}
              longitude={longitude}
              photo={mapPinIcon(item.route.path)}
            />
          </div>
        </section>
      )}
    </PageShell>
  );
}

// ---- Artículos (blog) ----

/** Newest first by publish date (missing dates sink to the end). */
function byPublishDateDesc(a: UmbracoItem, b: UmbracoItem): number {
  const time = (item: UmbracoItem) => {
    const value = item.properties["publishDate"];
    const t = typeof value === "string" ? new Date(value).getTime() : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  return time(b) - time(a);
}

async function ArticlesView({
  item,
  query,
}: {
  item: UmbracoItem;
  query: ListingQuery;
}) {
  const locale = await activeLocale();
  const articles = (await getChildren(item.route.path))
    .filter((c) => c.contentType === "article")
    .sort(byPublishDateDesc);
  return (
    <PageShell item={item}>
      <h1 className="mt-4 text-3xl font-bold">{item.name}</h1>
      {text(item, "intro") && (
        <p className="mt-2 max-w-2xl text-neutral-600">{text(item, "intro")}</p>
      )}
      <Listing
        name={item.name}
        locale={locale}
        basePath={item.route.path}
        query={query}
        entries={articles}
        markersById={NO_MARKERS}
        card={(article) => (
          <ArticleCard key={article.id} article={article} locale={locale} />
        )}
        emptyLabel={t(locale).article.empty}
        gridClassName="mt-8 space-y-5"
      />
    </PageShell>
  );
}

async function ArticleView({ item }: { item: UmbracoItem }) {
  const locale = await activeLocale();
  const hero = text(item, "heroImageUrl");
  const category = text(item, "category");
  const author = text(item, "author");
  const date = articleDate(item, locale);
  const parentPath = `/${item.route.path.split("/").filter(Boolean).slice(0, -1).join("/")}`;
  const others = (await getChildren(parentPath))
    .filter((c) => c.contentType === "article" && c.id !== item.id)
    .sort(byPublishDateDesc)
    .slice(0, 3);

  return (
    <PageShell item={item}>
      <JsonLd data={articleJsonLd(item, text(item, "summary"), locale)} />
      <article className="mt-4">
        {category && (
          <span className="inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800">
            {category}
          </span>
        )}
        <h1 className="mt-3 max-w-3xl text-3xl font-bold sm:text-4xl">
          {item.name}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          {date && (
            <time
              dateTime={
                typeof item.properties["publishDate"] === "string"
                  ? item.properties["publishDate"]
                  : undefined
              }
            >
              {date}
            </time>
          )}
          {date && author ? " · " : ""}
          {author}
        </p>
        {text(item, "summary") && (
          <p className="mt-4 max-w-3xl text-lg text-neutral-600">
            {text(item, "summary")}
          </p>
        )}
        {/* La portada de un artículo es una URL suelta y no una imagen de la
            biblioteca: no se sabe cuánto mide, así que lo único que se puede hacer por
            ella es no meterla en una caja de 2,9:1, que le cortaba casi la mitad. Un
            16:9 es la forma de una foto de paisaje. */}
        {hero && (
          <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl bg-neutral-200">
            <PhotoFit
              src={hero}
              alt={item.name}
              sizes="(min-width: 1152px) 1104px, 100vw"
              priority
            />
          </div>
        )}
        <div className="mt-8">
          <ArticleBody markdown={text(item, "body")} />
        </div>
      </article>

      {others.length > 0 && (
        <section className="mt-12 border-t border-neutral-200 pt-8">
          <h2 className="text-xl font-semibold">{t(locale).article.more}</h2>
          <div className="mt-5 space-y-5">
            {others.map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
        </section>
      )}
    </PageShell>
  );
}

// ---- "Qué Hacer" guide ----

/**
 * Whether a free-text "Horario" (e.g. "Mar - Dom 9:00AM - 5:00PM", "Abierto 24
 * horas") includes a day of the week (JS getDay index). Each line is read word
 * by word against the day table the JSON-LD parser uses, so "marzo" or "month"
 * is not a day, and consecutive days on a line read as a range. Fails open:
 * an empty text, or one with no recognizable day, counts as open.
 */
function openOn(hours: string, day: number): boolean {
  if (!hours.trim()) return true;
  const normalized = hours.toLowerCase();
  if (/24\s*(?:horas|hours)|24\/7/.test(normalized)) return true;
  let sawDays = false;
  for (const line of normalized.split("\n")) {
    const days = [...line.matchAll(/[a-záéíóúñ]+/g)]
      .map((match) => DAY_TOKENS[match[0]])
      .filter((index): index is number => index !== undefined);
    if (days.length === 0) continue;
    sawDays = true;
    if (days.includes(day)) return true;
    // Consecutive pairs read as ranges ("Lun - Vie"), Monday-based to wrap Sunday.
    const mondayBased = (d: number) => (d + 6) % 7;
    const t = mondayBased(day);
    for (let i = 0; i + 1 < days.length; i += 1) {
      const from = mondayBased(days[i]);
      const to = mondayBased(days[i + 1]);
      if (from <= to ? t >= from && t <= to : t >= from || t <= to) return true;
    }
  }
  return !sawDays;
}

/**
 * Category sections shown as "ideas" (leisure only; excludes service listings).
 * "Cines" is out too: its section is today's cartelera, not a list of theaters.
 */
const IDEAS_EXCLUDED_SLUGS = new Set([
  "empresas-y-servicios",
  "atracciones",
  "cines",
]);

/** How many entries each block shows in the overview, and alone when picked. */
const GUIDE_PREVIEW = 6;
const GUIDE_FOCUSED = 24;
/** The days the guide can be planned for: today and the six after it. */
const GUIDE_DAYS = 7;
/** How far past the day the events block looks when nothing happens on it. */
const GUIDE_EVENT_DAYS = 15;

/** The calendar day of a CMS date, which arrives as wall-clock text without an offset. */
function calendarDay(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

async function ThingsToDoView({
  item,
  citySlug,
  query,
}: {
  item: UmbracoItem;
  citySlug: string;
  query: ListingQuery;
}) {
  const locale = await activeLocale();
  const words = t(locale);
  const cityPath = `/${citySlug}`;

  // The day being planned, in the city's own time — a server past midnight in
  // UTC must not open tomorrow's guide — and its weekday for the opening hours.
  const today = todayInDR();
  const dates = Array.from({ length: GUIDE_DAYS }, (_, i) => addDays(today, i));
  const date =
    typeof query.fecha === "string" && dates.includes(query.fecha)
      ? query.fecha
      : today;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  const [cityItem, sections, allEvents, top] = await Promise.all([
    getItem(cityPath),
    getChildren(cityPath),
    getDescendantsOfType(cityPath, "eventItem", 100),
    getTopMovies(citySlug, date, GUIDE_FOCUSED, locale),
  ]);

  // El pronóstico del día que se planifica. La petición es la misma URL que ya
  // pidió la cabecera, así que no cuesta una segunda: React la deduplica.
  const weather = cityItem
    ? await getCityWeather(num(cityItem, "latitude"), num(cityItem, "longitude"))
    : null;

  const category = (slug: string) =>
    sections.find(
      (s) =>
        s.contentType === "categoryPage" && canonicalSlug(slugOf(s)) === slug,
    );
  const attractionsSection = category("atracciones");
  const cinemasSection = category("cines");
  const eventsSection = sections.find((s) => s.contentType === "eventsPage");
  const ideaSections = sections.filter(
    (s) =>
      s.contentType === "categoryPage" &&
      !IDEAS_EXCLUDED_SLUGS.has(canonicalSlug(slugOf(s))),
  );

  // Whole sections come back, so every count the chips carry is free.
  const [allAttractions, ideaEntries] = await Promise.all([
    attractionsSection
      ? listingEntriesOrdered(attractionsSection.route.path)
      : Promise.resolve([] as UmbracoItem[]),
    Promise.all(
      ideaSections.map((section) => listingEntriesOrdered(section.route.path)),
    ),
  ]);
  const openAttractions = allAttractions.filter((entry) =>
    openOn(text(entry, "hours"), weekday),
  );

  // The events of the day lead; when there are none, the next ones after it.
  const dated = allEvents
    .flatMap((event) => {
      const start = calendarDay(text(event, "startDate"));
      if (!start) return [];
      return [
        { event, start, end: calendarDay(text(event, "endDate")) ?? start },
      ];
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  const onDate = dated.filter(({ start, end }) => start <= date && date <= end);
  const horizon = addDays(date, GUIDE_EVENT_DAYS);
  const upcoming =
    onDate.length > 0
      ? onDate
      : dated.filter(({ start }) => start > date && start <= horizon);

  // What the day offers decides which activities a URL may narrow the page to,
  // and how much of one block is shown: alone, it gets more of itself.
  const offered = [
    ...(openAttractions.length > 0 ? ["atracciones"] : []),
    ...(upcoming.length > 0 ? ["eventos"] : []),
    ...(top.total > 0 ? ["cines"] : []),
    ...ideaSections
      .filter((_, i) => ideaEntries[i].length > 0)
      .map((section) => canonicalSlug(slugOf(section))),
  ];
  const picked = guidePicks(query, offered);
  const cap = picked.length === 1 ? GUIDE_FOCUSED : GUIDE_PREVIEW;

  const attractionEntries = openAttractions.slice(0, cap);
  const attractions: GuideAttractions | null =
    attractionsSection && attractionEntries.length > 0
      ? {
          entries: attractionEntries,
          markers: [
            ...(
              await listingMarkers(
                attractionsSection.route.path,
                attractionEntries,
              )
            ).values(),
          ].flat(),
          total: openAttractions.length,
          href: attractionsSection.route.path,
        }
      : null;

  const eventEntries = upcoming
    .slice(0, cap)
    .map(({ event }) => eventEntry(event));
  const events: GuideEvents | null =
    eventEntries.length > 0
      ? {
          entries: eventEntries,
          total: upcoming.length,
          href: eventsSection?.route.path ?? null,
          onDate: onDate.length > 0,
        }
      : null;

  const movies: GuideMovies | null =
    top.total > 0
      ? {
          cards: top.movies.slice(0, cap),
          total: top.total,
          href: cinemasSection?.route.path ?? null,
        }
      : null;

  const ideas: GuideSection[] = await Promise.all(
    ideaSections.map(async (section, i) => {
      const entries = ideaEntries[i].slice(0, cap);
      return {
        id: section.id,
        name: section.name,
        slug: canonicalSlug(slugOf(section)),
        href: section.route.path,
        entries,
        markers: [
          ...(await listingMarkers(section.route.path, entries)).values(),
        ].flat(),
        total: ideaEntries[i].length,
      };
    }),
  );

  const heading = words.thingsToDo.heading(cityItem?.name ?? item.name);
  return (
    <PageShell item={item}>
      {/* The intro is the page's meta description only: on the page itself the
          planner's controls are what should sit under the title. */}
      <h1 className="mt-4 text-3xl font-bold">{heading}</h1>

      <ThingsToDoExplorer
        locale={locale}
        name={heading}
        basePath={item.route.path}
        query={query}
        dates={dates}
        date={date}
        today={today}
        picked={picked}
        weather={weather}
        attractions={attractions}
        events={events}
        movies={movies}
        sections={ideas.filter((section) => section.entries.length > 0)}
      />
    </PageShell>
  );
}
