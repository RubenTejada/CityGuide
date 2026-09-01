import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import ArticleBody from "@/components/ArticleBody";
import JsonLd from "@/components/JsonLd";
import ArticleCard, { articleDate } from "@/components/ArticleCard";
import BranchesMap, { type BranchMarker } from "@/components/BranchesMap";
import FacilityBadges from "@/components/FacilityBadges";
import AttractionCard from "@/components/AttractionCard";
import FacilityFilterGrid from "@/components/FacilityFilterGrid";
import PlaceCard from "@/components/PlaceCard";
import PlaceMap from "@/components/PlaceMap";
import Rating from "@/components/Rating";
import Cartelera from "@/components/cine/Cartelera";
import EventsList, { type EventEntry } from "@/components/EventsList";
import ThingsToDoExplorer, {
  type GuideSection,
} from "@/components/ThingsToDoExplorer";
import TrailerModal from "@/components/cine/TrailerModal";
import { CINEMAS_BY_CITY, cinemaByName } from "@/lib/cinema";
import { sectionListImage, sectionMapIcon } from "@/lib/sections";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  eventJsonLd,
  isNoIndex,
  itemListJsonLd,
  movieJsonLd,
  organizationJsonLd,
  pageMetadata,
  placeJsonLd,
  seoDescription,
  seoTitle,
} from "@/lib/seo";
import {
  facilities,
  getChildren,
  getDescendantsOfType,
  getItem,
  num,
  photoUrl,
  slugOf,
  text,
  type UmbracoItem,
} from "@/lib/umbraco";

export const revalidate = 600;

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string; slug: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { city, slug } = await params;
  const path = `/${city}/${slug.join("/")}`;
  const item = await getItem(path);
  if (!item) notFound();

  switch (item.contentType) {
    case "categoryPage": {
      const { fecha } = await searchParams;
      return (
        <CategoryView
          item={item}
          citySlug={city}
          fecha={typeof fecha === "string" ? fecha : undefined}
        />
      );
    }
    case "subcategory":
      return <SubcategoryView item={item} />;
    case "company":
      return <CompanyView item={item} />;
    case "mall":
      return <MallView item={item} />;
    case "place": {
      // A cinema branch page ("Cines" section) also shows its own cartelera.
      const cinema = slug.includes("cines")
        ? cinemaByName(city, item.name)
        : null;
      if (cinema) {
        const { fecha } = await searchParams;
        return (
          <>
            <PlaceView item={item} />
            <div className="mx-auto max-w-6xl px-6 pb-8">
              <Cartelera
                citySlug={city}
                basePath={item.route.path}
                selectedDate={typeof fecha === "string" ? fecha : undefined}
                cinema={cinema}
              />
            </div>
          </>
        );
      }
      return <PlaceView item={item} />;
    }
    case "movie":
      return <MovieView item={item} citySlug={city} />;
    case "eventsPage":
      return <EventsView item={item} />;
    case "eventItem":
      return <EventView item={item} />;
    case "thingsToDoPage":
      return <ThingsToDoView item={item} citySlug={city} />;
    case "articlesPage":
      return <ArticlesView item={item} />;
    case "article":
      return <ArticleView item={item} />;
    default:
      notFound();
  }
}

/** The city node a content path belongs to (its first path segment). */
async function cityOf(item: UmbracoItem): Promise<UmbracoItem | null> {
  const citySlug = item.route.path.split("/").filter(Boolean)[0] ?? "";
  return citySlug ? getItem(`/${citySlug}`) : null;
}

/** The item one level up, or null at the city level. */
async function parentOf(item: UmbracoItem): Promise<UmbracoItem | null> {
  const segments = item.route.path.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  return getItem(`/${segments.slice(0, -1).join("/")}`);
}

/**
 * Title/description per document type. Everything is derived from the item and
 * its ancestors, so a new place or article is optimised the moment it is
 * published; editors can still override any of it from the SEO tab.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; slug: string[] }>;
}): Promise<Metadata> {
  const { city: citySlug, slug } = await params;
  const item = await getItem(`/${citySlug}/${slug.join("/")}`);
  if (!item) return {};

  const [cityItem, parent] = await Promise.all([cityOf(item), parentOf(item)]);
  const cityName = cityItem?.name ?? "";
  const inCity = cityName ? ` en ${cityName}` : "";
  // The company/subcategory/category a place hangs from, used to qualify titles.
  const parentName = parent && parent.contentType !== "city" ? parent.name : "";
  const qualified = parentName ? `${item.name} — ${parentName}${inCity}` : `${item.name}${inCity}`;

  let title = `${item.name}${inCity}`;
  let description = "";
  let image = photoUrl(item);
  let type: "website" | "article" = "website";
  let publishedTime: string | undefined;
  let modifiedTime: string | undefined;

  switch (item.contentType) {
    case "categoryPage":
      title = `${item.name}${inCity}`;
      description = seoDescription(
        item,
        text(item, "intro"),
        `${item.name}${inCity}: direcciones, teléfonos, horarios, valoraciones y mapa.`,
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "subcategory":
      title = seoTitle(item, qualified, `${item.name}${inCity}`);
      description = seoDescription(
        item,
        `${item.name} ${parentName ? `— ${parentName} ` : ""}${inCity}: los lugares recomendados con dirección, horario, teléfono y mapa.`,
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "place":
    case "mall": {
      const company = parent?.contentType === "company" ? parent : null;
      const inherited = (alias: string) =>
        text(item, alias) || (company ? text(company, alias) : "");
      title = seoTitle(item, qualified, `${item.name}${inCity}`);
      description = seoDescription(
        item,
        inherited("description"),
        `${item.name}${text(item, "address") ? `, ${text(item, "address")}` : ""}${inCity}. Horario, teléfono, ubicación y cómo llegar.`,
      );
      image = image ?? (company ? photoUrl(company) : null) ?? sectionListImage(item.route.path);
      break;
    }
    case "company":
      title = seoTitle(item, `${item.name} — sucursales${inCity}`, `${item.name}${inCity}`);
      description = seoDescription(
        item,
        text(item, "description"),
        `Sucursales de ${item.name}${inCity}: direcciones, teléfonos, horarios y mapa.`,
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "movie":
      title = seoTitle(item, `${item.name} — cartelera${inCity}`, `${item.name} — cartelera`);
      description = seoDescription(
        item,
        text(item, "synopsis"),
        `Horarios, sinopsis y trailer de ${item.name} en los cines${inCity}.`,
      );
      image = text(item, "posterUrl") || image;
      break;
    case "eventsPage":
      title = seoTitle(item, `Eventos${inCity}`);
      description = seoDescription(
        item,
        text(item, "intro"),
        `Agenda de eventos${inCity}: conciertos, festivales, ferias y actividades con fecha, lugar y entradas.`,
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "eventItem": {
      const dates = formatDate(item.properties["startDate"]);
      title = seoTitle(
        item,
        dates ? `${item.name} — ${dates}${inCity}` : `${item.name}${inCity}`,
        `${item.name}${inCity}`,
      );
      description = seoDescription(
        item,
        text(item, "description"),
        `${item.name}${dates ? `, ${dates}` : ""}${text(item, "venueName") ? ` en ${text(item, "venueName")}` : inCity}. Fecha, lugar y entradas.`,
      );
      break;
    }
    case "thingsToDoPage":
      title = seoTitle(item, `Qué hacer${inCity}`);
      description = seoDescription(
        item,
        text(item, "intro"),
        `Ideas de planes${inCity}: eventos de los próximos días, atracciones abiertas hoy y lugares para comer y salir.`,
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "articlesPage":
      title = seoTitle(item, `${item.name}${inCity}`);
      description = seoDescription(
        item,
        text(item, "intro"),
        `Artículos, guías y recomendaciones${inCity}.`,
      );
      image = image ?? sectionListImage(item.route.path);
      break;
    case "article":
      title = seoTitle(item, item.name);
      description = seoDescription(item, text(item, "summary"), text(item, "body"));
      image = text(item, "heroImageUrl") || image;
      type = "article";
      publishedTime =
        typeof item.properties["publishDate"] === "string"
          ? item.properties["publishDate"]
          : item.createDate;
      modifiedTime = item.updateDate;
      break;
    default:
      description = seoDescription(item, text(item, "description"));
  }

  return pageMetadata({
    title,
    description,
    path: item.route.path,
    image,
    type,
    publishedTime,
    modifiedTime,
    noIndex: isNoIndex(item),
  });
}

async function Breadcrumb({ item }: { item: UmbracoItem }) {
  const segments = item.route.path.split("/").filter(Boolean);
  const crumbs = await Promise.all(
    segments.slice(0, -1).map(async (_, index) => {
      const ancestorPath = `/${segments.slice(0, index + 1).join("/")}`;
      const ancestor = await getItem(ancestorPath);
      return ancestor ? { name: ancestor.name, path: ancestor.route.path } : null;
    }),
  );
  const trail = [
    { name: "Inicio", path: "/" },
    ...crumbs.filter((crumb) => crumb !== null),
    { name: item.name, path: item.route.path },
  ];
  return (
    <nav className="text-sm text-neutral-500" aria-label="Ruta de navegación">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.filter(Boolean).map((crumb) => (
          <li key={crumb!.path} className="flex items-center gap-1">
            <Link href={crumb!.path} className="hover:text-brand-600">
              {crumb!.name}
            </Link>
            <span aria-hidden>›</span>
          </li>
        ))}
        <li className="font-medium text-neutral-800">{item.name}</li>
      </ol>
    </nav>
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
    <main className="mx-auto max-w-6xl px-6 py-8">
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
  const [places, companies, malls] = await Promise.all([
    getDescendantsOfType(path, "place"),
    getDescendantsOfType(path, "company"),
    getDescendantsOfType(path, "mall"),
  ]);
  // Delivery API route paths may or may not carry a trailing slash — normalize.
  const under = (containers: UmbracoItem[], item: UmbracoItem) =>
    containers.some((c) =>
      item.route.path.startsWith(`${c.route.path.replace(/\/+$/, "")}/`),
    );
  const standaloneCompanies = companies.filter((c) => !under(malls, c));
  const standalonePlaces = places.filter(
    (p) => !under(companies, p) && !under(malls, p),
  );
  return [...malls, ...standaloneCompanies, ...standalonePlaces];
}

/** Category pages that offer the "Facilidades" dropdown filter. */
const FACILITY_FILTER_SLUGS = new Set([
  "restaurantes",
  "bares-y-clubes",
  "tiendas",
  "empresas-y-servicios",
]);

/**
 * Facilities each listing entry can be filtered by: a place's own facilities;
 * for companies and malls, the union with those of every place nested under
 * them (branches, establishments).
 */
async function listingFacilities(
  path: string,
  entries: UmbracoItem[],
): Promise<Record<string, string[]>> {
  const allPlaces = await getDescendantsOfType(path, "place");
  return Object.fromEntries(
    entries.map((entry) => {
      const own = facilities(entry);
      if (entry.contentType === "place") return [entry.id, own];
      const prefix = `${entry.route.path.replace(/\/+$/, "")}/`;
      const nested = allPlaces
        .filter((p) => p.route.path.startsWith(prefix))
        .flatMap(facilities);
      return [entry.id, [...new Set([...own, ...nested])]];
    }),
  );
}

/** Map markers for the malls in a listing (used at the bottom of the page). */
function mallMarkers(entries: UmbracoItem[]): BranchMarker[] {
  return entries
    .filter((e) => e.contentType === "mall")
    .map((mall) => ({
      id: mall.id,
      name: mall.name,
      url: mall.route.path,
      address: text(mall, "address") || null,
      latitude: num(mall, "latitude"),
      longitude: num(mall, "longitude"),
      logo: photoUrl(mall),
      rating: num(mall, "googleRating") || null,
      ratingCount: num(mall, "googleRatingCount") || null,
    }))
    .filter((m) => m.latitude !== 0 && m.longitude !== 0);
}

function SubcategoryPills({ subcategories }: { subcategories: UmbracoItem[] }) {
  return subcategories.map((sub) => (
    <Link
      key={sub.id}
      href={sub.route.path}
      className="rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-sm font-medium hover:border-brand-500 hover:text-brand-600"
    >
      {sub.name}
    </Link>
  ));
}

async function CategoryView({
  item,
  citySlug,
  fecha,
}: {
  item: UmbracoItem;
  citySlug?: string;
  fecha?: string;
}) {
  const [children, entries] = await Promise.all([
    getChildren(item.route.path),
    listingEntries(item.route.path),
  ]);
  const subcategories = children.filter((c) => c.contentType === "subcategory");
  const categorySlug = item.route.path.split("/").filter(Boolean).pop();
  const showCartelera =
    categorySlug === "cines" && !!citySlug && citySlug in CINEMAS_BY_CITY;
  const facilitiesByEntry = FACILITY_FILTER_SLUGS.has(categorySlug ?? "")
    ? await listingFacilities(item.route.path, entries)
    : null;

  return (
    <PageShell item={item}>
      <JsonLd data={itemListJsonLd(item.name, entries)} />
      <h1 className="mt-4 text-3xl font-bold">{item.name}</h1>
      {text(item, "intro") && (
        <p className="mt-2 max-w-2xl text-neutral-600">{text(item, "intro")}</p>
      )}
      {!facilitiesByEntry && subcategories.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          <SubcategoryPills subcategories={subcategories} />
        </div>
      )}
      {showCartelera && (
        <Cartelera
          citySlug={citySlug!}
          basePath={item.route.path}
          selectedDate={fecha}
        />
      )}
      {facilitiesByEntry ? (
        <FacilityFilterGrid entries={entries} facilitiesByEntry={facilitiesByEntry}>
          <SubcategoryPills subcategories={subcategories} />
        </FacilityFilterGrid>
      ) : (
        (entries.length > 0 || !showCartelera) && (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {entries.map((entry) =>
              // Attractions use the large-photo layout, same as the events listing.
              categorySlug === "atracciones" ? (
                <AttractionCard key={entry.id} place={entry} />
              ) : (
                <PlaceCard key={entry.id} place={entry} />
              ),
            )}
            {entries.length === 0 && (
              <p className="text-neutral-500">
                No hay lugares publicados todavía.
              </p>
            )}
          </div>
        )
      )}
      <MallsMapSection markers={mallMarkers(entries)} />
    </PageShell>
  );
}

/** Bottom-of-listing map with every mall in the listing. */
function MallsMapSection({ markers }: { markers: BranchMarker[] }) {
  if (markers.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Mapa de plazas</h2>
      <div className="mt-4">
        <BranchesMap branches={markers} />
      </div>
    </section>
  );
}

/** Agent-maintained cartelera catalog entry (movie doc type under Cines). */
function MovieView({ item, citySlug }: { item: UmbracoItem; citySlug: string }) {
  const poster = text(item, "posterUrl");
  const trailer = text(item, "trailerYoutubeId");
  const meta = [
    text(item, "rating"),
    text(item, "duration") && `${text(item, "duration")} min`,
    text(item, "genre"),
  ].filter(Boolean);

  return (
    <PageShell item={item}>
      <JsonLd data={movieJsonLd(item)} />
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
          </div>
          {meta.length > 0 && (
            <p className="mt-2 text-sm text-neutral-500">{meta.join(" · ")}</p>
          )}
          {text(item, "synopsis") && (
            <p className="mt-4 max-w-2xl text-neutral-700">
              {text(item, "synopsis")}
            </p>
          )}
          <Link
            href={`/${citySlug}/cines`}
            className="mt-6 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Ver horarios en cartelera
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

async function SubcategoryView({ item }: { item: UmbracoItem }) {
  const entries = await listingEntries(item.route.path);
  return (
    <PageShell item={item}>
      <JsonLd data={itemListJsonLd(item.name, entries)} />
      <h1 className="mt-4 text-3xl font-bold">{item.name}</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {entries.map((entry) => (
          <PlaceCard key={entry.id} place={entry} />
        ))}
        {entries.length === 0 && (
          <p className="text-neutral-500">No hay lugares publicados todavía.</p>
        )}
      </div>
      <MallsMapSection markers={mallMarkers(entries)} />
    </PageShell>
  );
}

/**
 * Mall page: general info header, establishments grouped by their category
 * subcategories (plus ungrouped direct children), and the location map.
 */
async function MallView({ item }: { item: UmbracoItem }) {
  const children = await getChildren(item.route.path);
  const groups = children.filter((c) => c.contentType === "subcategory");
  const ungrouped = children.filter(
    (c) => c.contentType === "place" || c.contentType === "company",
  );
  const groupEntries = await Promise.all(
    groups.map((group) => listingEntries(group.route.path)),
  );
  const photo = photoUrl(item);
  const website = text(item, "website");
  const latitude = num(item, "latitude");
  const longitude = num(item, "longitude");
  const cityItem = await cityOf(item);

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
          <Image
            src={photo ?? sectionListImage(item.route.path)}
            alt={item.name}
            fill
            className="object-cover"
            sizes="128px"
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">{item.name}</h1>
          <dl className="mt-3 space-y-1.5 text-sm">
            {text(item, "address") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Dirección</dt>
                <dd className="text-neutral-700">{text(item, "address")}</dd>
              </div>
            )}
            {text(item, "phone") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Teléfono</dt>
                <dd className="text-neutral-700">{text(item, "phone")}</dd>
              </div>
            )}
            {website && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Sitio Web</dt>
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
                <dt className="font-semibold text-brand-700">Horario</dt>
                <dd className="whitespace-pre-line text-neutral-700">{text(item, "hours")}</dd>
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

      {groups.map((group, index) => (
        <section key={group.id} className="mt-10">
          <h2 className="text-lg font-semibold">
            {group.name}{" "}
            {groupEntries[index].length > 0 && `(${groupEntries[index].length})`}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {groupEntries[index].map((entry) => (
              <PlaceCard key={entry.id} place={entry} />
            ))}
            {groupEntries[index].length === 0 && (
              <p className="text-neutral-500">
                No hay establecimientos publicados todavía.
              </p>
            )}
          </div>
        </section>
      ))}

      {ungrouped.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Establecimientos</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {ungrouped.map((entry) => (
              <PlaceCard key={entry.id} place={entry} />
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 && ungrouped.length === 0 && (
        <p className="mt-10 text-neutral-500">
          No hay establecimientos publicados todavía.
        </p>
      )}

      {latitude !== 0 && longitude !== 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Ubicación</h2>
          <div className="mt-4">
            <PlaceMap
              id={item.id}
              name={item.name}
              latitude={latitude}
              longitude={longitude}
              photo={photo ?? sectionMapIcon(item.route.path)}
            />
          </div>
        </section>
      )}
    </PageShell>
  );
}

async function CompanyView({ item }: { item: UmbracoItem }) {
  const children = await getChildren(item.route.path);
  const logo = photoUrl(item);
  const branches = children.filter((c) => c.contentType === "place");
  const website = text(item, "website");
  const branchMarkers: BranchMarker[] = branches
    .map((branch) => ({
      id: branch.id,
      name: branch.name,
      url: branch.route.path,
      address: text(branch, "address") || null,
      latitude: num(branch, "latitude"),
      longitude: num(branch, "longitude"),
      logo: photoUrl(branch) ?? logo,
      rating: num(branch, "googleRating") || null,
      ratingCount: num(branch, "googleRatingCount") || null,
    }))
    .filter((b) => b.latitude !== 0 && b.longitude !== 0);
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
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">{item.name}</h1>
          <dl className="mt-3 space-y-1.5 text-sm">
            {text(item, "phone") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Teléfono</dt>
                <dd className="text-neutral-700">{text(item, "phone")}</dd>
              </div>
            )}
            {website && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Sitio Web</dt>
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
                <dt className="font-semibold text-brand-700">Horario</dt>
                <dd className="whitespace-pre-line text-neutral-700">{text(item, "hours")}</dd>
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
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {branches.map((branch) => (
          <PlaceCard key={branch.id} place={branch} fallbackPhoto={logo} />
        ))}
        {branches.length === 0 && (
          <p className="text-neutral-500">No hay sucursales publicadas todavía.</p>
        )}
      </div>

      {branchMarkers.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Mapa de sucursales</h2>
          <div className="mt-4">
            <BranchesMap branches={branchMarkers} />
          </div>
        </section>
      )}
    </PageShell>
  );
}

async function PlaceView({ item }: { item: UmbracoItem }) {
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
  const ownPhoto = photoUrl(item);
  const inheritedPhoto = ownPhoto ?? (company ? photoUrl(company) : null);
  // No photo and no company logo: fall back to the section's image.
  const photo = inheritedPhoto ?? sectionListImage(item.route.path);
  // An inherited company logo is letterboxed with a soft border instead of
  // being cropped to the square like a real photo.
  const isLogo = inheritedPhoto !== null && ownPhoto === null;
  const website = inherited("website");
  const cityItem = await cityOf(item);

  return (
    <PageShell item={item}>
      <JsonLd
        data={placeJsonLd({
          item,
          cityName: cityItem?.name ?? "",
          country: text(cityItem ?? item, "country"),
          description: inherited("description"),
          phone: inherited("phone"),
          website,
          hours: inherited("hours"),
          image: inheritedPhoto,
        })}
      />
      <h1 className="mt-4 text-3xl font-bold">{item.name}</h1>
      <div className="mt-1">
        <Rating place={item} />
      </div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[20rem_1fr]">
        <div>
          <div
            className={`relative aspect-square overflow-hidden rounded-xl ${
              isLogo ? "border border-neutral-200 bg-white" : "bg-neutral-200"
            }`}
          >
            <Image
              src={photo}
              alt={item.name}
              fill
              unoptimized={photo.endsWith(".svg")}
              className={isLogo ? "object-contain p-6" : "object-cover"}
              sizes="(min-width: 1024px) 20rem, 100vw"
            />
          </div>
          {inherited("hours") && (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
              <h2 className="font-semibold">Horario</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-neutral-600">
                {inherited("hours")}
              </p>
            </div>
          )}
        </div>

        <div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="font-semibold text-brand-700">Dirección</dt>
              <dd className="text-neutral-700">{text(item, "address")}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-brand-700">
                {company ? "Empresa" : "Categoría"}
              </dt>
              <dd className="text-neutral-700">{categoryName}</dd>
            </div>
            {inherited("phone") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Teléfono</dt>
                <dd className="text-neutral-700">{inherited("phone")}</dd>
              </div>
            )}
            {website && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Sitio Web</dt>
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
                Acerca de {company ? company.name : item.name}
              </h2>
              <p className="mt-2 whitespace-pre-line text-neutral-700">
                {inherited("description")}
              </p>
            </>
          )}

          {facilities(item).length > 0 && (
            <>
              <h2 className="mt-6 text-lg font-semibold">Facilidades del lugar</h2>
              <div className="mt-3">
                <FacilityBadges facilities={facilities(item)} />
              </div>
            </>
          )}
        </div>
      </div>

      {latitude !== 0 && longitude !== 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Mapa</h2>
          <div className="mt-4">
            <PlaceMap
              id={item.id}
              name={item.name}
              latitude={latitude}
              longitude={longitude}
              photo={inheritedPhoto ?? sectionMapIcon(item.route.path)}
            />
          </div>
        </section>
      )}
    </PageShell>
  );
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-DO", { dateStyle: "long" }).format(date);
}

async function EventsView({ item }: { item: UmbracoItem }) {
  const events = await getChildren(item.route.path);
  const entries: EventEntry[] = events.map((event) => ({
    id: event.id,
    href: event.route.path,
    name: event.name,
    category: text(event, "category"),
    startDate: typeof event.properties["startDate"] === "string" ? event.properties["startDate"] : "",
    endDate: typeof event.properties["endDate"] === "string" ? event.properties["endDate"] : "",
    venueName: text(event, "venueName"),
    description: text(event, "description"),
    photo: photoUrl(event),
  }));
  return (
    <PageShell item={item}>
      <JsonLd data={itemListJsonLd(item.name, events)} />
      <h1 className="mt-4 text-3xl font-bold">Eventos</h1>
      <EventsList events={entries} />
    </PageShell>
  );
}

async function EventView({ item }: { item: UmbracoItem }) {
  const latitude = num(item, "latitude");
  const longitude = num(item, "longitude");
  const photo = photoUrl(item);
  const website = text(item, "website");
  const phone = text(item, "phone");
  const dates = `${formatDate(item.properties["startDate"])}${
    item.properties["endDate"] ? ` — ${formatDate(item.properties["endDate"])}` : ""
  }`;
  const cityItem = await cityOf(item);

  return (
    <PageShell item={item}>
      <JsonLd
        data={eventJsonLd(item, cityItem?.name ?? "", text(cityItem ?? item, "country"))}
      />
      <h1 className="mt-4 text-3xl font-bold">{item.name}</h1>
      {text(item, "category") && (
        <span className="mt-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800">
          {text(item, "category")}
        </span>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[20rem_1fr]">
        <div>
          <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-200">
            {photo ? (
              <Image
                src={photo}
                alt={item.name}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 20rem, 100vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-6xl" aria-hidden>
                🎟️
              </div>
            )}
          </div>
          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="font-semibold">Fecha</h2>
            <p className="mt-1 text-sm text-neutral-600">{dates}</p>
          </div>
        </div>

        <div>
          <dl className="space-y-1.5 text-sm">
            {text(item, "venueName") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Lugar</dt>
                <dd className="text-neutral-700">{text(item, "venueName")}</dd>
              </div>
            )}
            {text(item, "address") && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Dirección</dt>
                <dd className="text-neutral-700">{text(item, "address")}</dd>
              </div>
            )}
            {phone && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Teléfono</dt>
                <dd className="text-neutral-700">{phone}</dd>
              </div>
            )}
            {website && (
              <div className="flex gap-2">
                <dt className="font-semibold text-brand-700">Entradas</dt>
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
              <h2 className="mt-6 text-lg font-semibold">Acerca del evento</h2>
              <p className="mt-2 whitespace-pre-line text-neutral-700">
                {text(item, "description")}
              </p>
            </>
          )}
        </div>
      </div>

      {latitude !== 0 && longitude !== 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Mapa</h2>
          <div className="mt-4">
            <PlaceMap
              id={item.id}
              name={item.name}
              latitude={latitude}
              longitude={longitude}
              photo={photo ?? sectionMapIcon(item.route.path)}
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

async function ArticlesView({ item }: { item: UmbracoItem }) {
  const articles = (await getChildren(item.route.path))
    .filter((c) => c.contentType === "article")
    .sort(byPublishDateDesc);
  return (
    <PageShell item={item}>
      <JsonLd data={itemListJsonLd(item.name, articles)} />
      <h1 className="mt-4 text-3xl font-bold">{item.name}</h1>
      {text(item, "intro") && (
        <p className="mt-2 max-w-2xl text-neutral-600">{text(item, "intro")}</p>
      )}
      <div className="mt-8 space-y-5">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
        {articles.length === 0 && (
          <p className="text-neutral-500">No hay artículos publicados todavía.</p>
        )}
      </div>
    </PageShell>
  );
}

async function ArticleView({ item }: { item: UmbracoItem }) {
  const hero = text(item, "heroImageUrl");
  const category = text(item, "category");
  const author = text(item, "author");
  const date = articleDate(item);
  const parentPath = `/${item.route.path.split("/").filter(Boolean).slice(0, -1).join("/")}`;
  const others = (await getChildren(parentPath))
    .filter((c) => c.contentType === "article" && c.id !== item.id)
    .sort(byPublishDateDesc)
    .slice(0, 3);

  return (
    <PageShell item={item}>
      <JsonLd data={articleJsonLd(item, text(item, "summary"))} />
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
        {hero && (
          <div className="relative mt-6 h-64 overflow-hidden rounded-2xl bg-neutral-200 sm:h-96">
            <Image
              src={hero}
              alt={item.name}
              fill
              className="object-cover"
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
          <h2 className="text-xl font-semibold">Más artículos</h2>
          <div className="mt-5 space-y-5">
            {others.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}
    </PageShell>
  );
}

// ---- "Qué Hacer" guide ----

/** JS getDay() index for each abbreviated Spanish day name used in "hours" texts. */
const DAY_INDEX: Record<string, number> = {
  dom: 0, lun: 1, mar: 2, mie: 3, mié: 3, jue: 4, vie: 5, sab: 6, sáb: 6,
};

/**
 * Whether a free-text "Horario" (e.g. "Mar - Dom 9:00AM - 5:00PM",
 * "Abierto 24 horas") includes today. Fails open: texts without a
 * recognizable day pattern count as open.
 */
function openToday(hours: string): boolean {
  if (!hours.trim()) return true;
  const normalized = hours.toLowerCase();
  if (normalized.includes("24 horas")) return true;
  const today = new Date().getDay();
  let sawDays = false;
  for (const line of normalized.split("\n")) {
    const days = [...line.matchAll(/\b(dom|lun|mar|mie|mié|jue|vie|sab|sáb)\b/g)].map(
      (m) => DAY_INDEX[m[1]],
    );
    if (days.length === 0) continue;
    sawDays = true;
    if (days.includes(today)) return true;
    // Consecutive pairs read as ranges ("Lun - Vie"), Monday-based to wrap Sunday.
    const mondayBased = (d: number) => (d + 6) % 7;
    const t = mondayBased(today);
    for (let i = 0; i + 1 < days.length; i += 1) {
      const from = mondayBased(days[i]);
      const to = mondayBased(days[i + 1]);
      if (from <= to ? t >= from && t <= to : t >= from || t <= to) return true;
    }
  }
  return !sawDays;
}

/** Category sections shown as "ideas" (leisure only; excludes service listings). */
const IDEAS_EXCLUDED_SLUGS = new Set(["empresas-y-servicios", "atracciones"]);

async function ThingsToDoView({
  item,
  citySlug,
}: {
  item: UmbracoItem;
  citySlug: string;
}) {
  const cityPath = `/${citySlug}`;
  const [cityItem, sections, events] = await Promise.all([
    getItem(cityPath),
    getChildren(cityPath),
    getDescendantsOfType(cityPath, "eventItem", 100),
  ]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Only events happening within the next 15 days.
  const horizon = new Date(todayStart);
  horizon.setDate(horizon.getDate() + 15);
  const upcoming = events
    .filter((event) => {
      const start = new Date(text(event, "startDate"));
      const end = new Date(text(event, "endDate") || text(event, "startDate"));
      return (
        !Number.isNaN(end.getTime()) &&
        end >= todayStart &&
        !Number.isNaN(start.getTime()) &&
        start <= horizon
      );
    })
    .sort(
      (a, b) =>
        new Date(text(a, "startDate")).getTime() -
        new Date(text(b, "startDate")).getTime(),
    );
  const eventEntries: EventEntry[] = upcoming.map((event) => ({
    id: event.id,
    href: event.route.path,
    name: event.name,
    category: text(event, "category"),
    startDate: typeof event.properties["startDate"] === "string" ? event.properties["startDate"] : "",
    endDate: typeof event.properties["endDate"] === "string" ? event.properties["endDate"] : "",
    venueName: text(event, "venueName"),
    description: text(event, "description"),
    photo: photoUrl(event),
  }));

  const attractionsSection = sections.find(
    (s) => s.contentType === "categoryPage" && slugOf(s) === "atracciones",
  );
  const attractions = attractionsSection
    ? (await listingEntries(attractionsSection.route.path)).filter((entry) =>
        openToday(text(entry, "hours")),
      )
    : [];

  const ideaSections = sections.filter(
    (s) => s.contentType === "categoryPage" && !IDEAS_EXCLUDED_SLUGS.has(slugOf(s)),
  );
  const ideas: GuideSection[] = await Promise.all(
    ideaSections.map(async (section) => ({
      id: section.id,
      name: section.name,
      slug: slugOf(section),
      href: section.route.path,
      entries: (await listingEntries(section.route.path)).slice(0, 4),
    })),
  );

  return (
    <PageShell item={item}>
      <JsonLd
        data={itemListJsonLd(
          `Qué hacer en ${cityItem?.name ?? item.name}`,
          ideaSections,
        )}
      />
      <h1 className="mt-4 text-3xl font-bold">
        Qué Hacer en {cityItem?.name ?? item.name}
      </h1>
      {text(item, "intro") && (
        <p className="mt-2 max-w-2xl text-neutral-600">{text(item, "intro")}</p>
      )}

      <ThingsToDoExplorer
        events={eventEntries}
        attractions={attractions}
        attractionsHref={attractionsSection?.route.path ?? null}
        sections={ideas}
      />
    </PageShell>
  );
}
