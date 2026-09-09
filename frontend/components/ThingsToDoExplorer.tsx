import Image from "next/image";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import ListingViews from "@/components/ListingViews";
import { PendingLink } from "@/components/LoadingOverlay";
import { addDays, type MovieCardProps } from "@/lib/cinema";
import {
  INTL_LOCALE,
  t as dictionary,
  type GuideDay,
  type Locale,
} from "@/lib/i18n";
import { queryValues, withParam, type ListingQuery } from "@/lib/listing";
import { sectionTileArt } from "@/lib/sections";
import { canonicalSlug } from "@/lib/sectionSlugs";
import { itemListJsonLd } from "@/lib/seo";
import { type UmbracoItem } from "@/lib/umbraco";
import AttractionCard from "./AttractionCard";
import DateTabs from "./cine/DateTabs";
import MovieCard from "./cine/MovieCard";
import { type MapMarker } from "./MarkersMap";
import { EventCard, eventMarkers, type EventEntry } from "./EventsList";
import PlaceCard from "./PlaceCard";
import { type ListingView } from "./ViewToggle";
import { WeatherForecast } from "./Weather";
import { weatherOn, type CityWeather } from "@/lib/weather";

/** The query parameter carrying the activity the guide is narrowed to. */
export const ACTIVITY_PARAM = "actividad";

/**
 * The activity slugs the URL asks for, among those the page offers that day.
 * An English slug maps to the Spanish one every block is keyed by; a label
 * from an old link, or a block that is empty on the day, is dropped — so a
 * stale URL falls back to the overview rather than to an empty page.
 */
export function guidePicks(query: ListingQuery, offered: string[]): string[] {
  return [
    ...new Set(queryValues(query, ACTIVITY_PARAM).map(canonicalSlug)),
  ].filter((slug) => offered.includes(slug));
}

export interface GuideSection {
  id: string;
  name: string;
  slug: string;
  href: string;
  /** The capped slice on screen; `total` is what the section holds. */
  entries: UmbracoItem[];
  /** The pins those entries put on the map view (a company pins its branches). */
  markers: MapMarker[];
  total: number;
}

export interface GuideAttractions {
  entries: UmbracoItem[];
  markers: MapMarker[];
  /** How many are open on the day, shown or not. */
  total: number;
  href: string;
}

export interface GuideEvents {
  entries: EventEntry[];
  total: number;
  href: string | null;
  /** Whether these happen on the day, or are the next ones after it. */
  onDate: boolean;
}

export interface GuideMovies {
  cards: MovieCardProps[];
  /** How many movies the day's billboard holds. */
  total: number;
  href: string | null;
}

/** Cards are dense on purpose: three across on wide screens, two on tablets. */
const CARD_GRID = "mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3";
/** The overview's cartelera: six posters in one row on a wide screen. */
const POSTER_GRID = "mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6";

/** Blocks whose entries are feminine nouns in Spanish ("Ver las 52"). */
const FEMININE_SLUGS = new Set(["atracciones", "cines", "tiendas"]);

/** The day being planned as the headings name it: "hoy", "mañana", or the date. */
function guideDay(date: string, today: string, locale: Locale): GuideDay {
  return {
    relative:
      date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : null,
    formatted: new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`)),
  };
}

type Tile = { slug: string; label: string; count: number; image: string };

const TILE_CLASS =
  "group block overflow-hidden rounded-xl border bg-white shadow-sm transition";
const TILE_IDLE = `${TILE_CLASS} border-neutral-200 hover:shadow-md`;
const TILE_ACTIVE = `${TILE_CLASS} border-sun-400 ring-2 ring-sun-400`;

/**
 * What the guide offers on the day, one tile each — the activity's drawing,
 * its name and its count — the overview of the page before any of it is read. A
 * tile narrows the page to that block alone, with more of it; the tile of the
 * block being read leads back to the overview, as does "Todo". They are
 * links, so the page is one someone can share and Back walks the picks; the
 * day picked stays in them.
 */
function ActivityTiles({
  label,
  all,
  basePath,
  query,
  tiles,
  picked,
}: {
  label: string;
  /** The overview's own tile: the guide's own scene. */
  all: Omit<Tile, "slug" | "count">;
  basePath: string;
  query: ListingQuery;
  tiles: Tile[];
  picked: string[];
}) {
  const overview = picked.length === 0;
  const tile = (
    href: string,
    active: boolean,
    image: string,
    name: string,
    count?: number,
  ) => (
    <PendingLink
      href={href}
      aria-current={active ? "true" : undefined}
      className={active ? TILE_ACTIVE : TILE_IDLE}
    >
      <div className="relative h-20 bg-neutral-900 sm:h-24">
        <Image
          src={image}
          alt=""
          fill
          unoptimized={image.endsWith(".svg")}
          className="object-cover transition duration-300 group-hover:scale-105"
          sizes="(min-width: 1024px) 160px, (min-width: 640px) 25vw, 33vw"
        />
      </div>
      {/* The caption is the inverse of the card: light text on a dark band —
          and the sun's yellow of the search button on the tile being read. */}
      <p
        className={`px-2 py-2 text-center text-sm leading-tight transition-colors ${
          active
            ? "bg-sun-400 font-semibold text-neutral-900"
            : "bg-neutral-900 font-medium text-white group-hover:bg-neutral-700"
        }`}
      >
        {name}
        {count !== undefined && (
          <span
            className={`ml-1.5 tabular-nums ${active ? "text-neutral-900/70" : "text-neutral-400"}`}
          >
            {count}
          </span>
        )}
      </p>
    </PendingLink>
  );
  return (
    <nav aria-label={label}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </h2>
      <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <li>
          {tile(
            withParam(basePath, query, ACTIVITY_PARAM, null),
            overview,
            all.image,
            all.label,
          )}
        </li>
        {tiles.map((entry) => {
          const active = picked.includes(entry.slug);
          return (
            <li key={entry.slug}>
              {tile(
                withParam(
                  basePath,
                  query,
                  ACTIVITY_PARAM,
                  active ? null : entry.slug,
                ),
                active,
                entry.image,
                entry.label,
                entry.count,
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A block's title and, beside it, the way to the section holding the rest. */
function BlockHeader({
  title,
  href,
  label,
}: {
  title: string;
  href: string | null;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {href && (
        <Link
          href={href}
          className="shrink-0 text-sm font-medium text-brand-600 hover:underline"
        >
          {label}
        </Link>
      )}
    </div>
  );
}

/**
 * The "Qué Hacer" guide as a planner: the day is picked first, then what to do
 * on it. Under the two rows of controls come the blocks — the attractions open
 * that day, its events (or the next ones), its cartelera, and one block per
 * section — each capped, each with a link to the section that holds the rest,
 * shown as cards or as one map of everything visible.
 *
 * Which day and which activity are read from the query string and settled on
 * the server, like every other listing of the portal — so the page is a link
 * someone can share, Back walks the picks, and the map view carries the pins
 * without also carrying every card nobody is looking at. There is no
 * pagination: a block alone shows more of itself than the overview does, and
 * the section page is where the rest is.
 */
export default function ThingsToDoExplorer({
  locale,
  name,
  basePath,
  query,
  dates,
  date,
  today,
  picked,
  weather,
  attractions,
  events,
  movies,
  sections,
}: {
  locale: Locale;
  /** The page heading, which names the ItemList the page declares. */
  name: string;
  basePath: string;
  query: ListingQuery;
  /** The days the guide can be planned for; the first is the page's default. */
  dates: string[];
  date: string;
  today: string;
  /** The activities the URL narrowed the page to, already validated. */
  picked: string[];
  /** El clima de la ciudad, del que la guía usa el día que se planifica. */
  weather: CityWeather | null;
  attractions: GuideAttractions | null;
  events: GuideEvents | null;
  /** The day's most-shown movies: the cinemas section is a cartelera, not a list. */
  movies: GuideMovies | null;
  sections: GuideSection[];
}) {
  const words = dictionary(locale);
  const guide = words.thingsToDo;
  const day = guideDay(date, today, locale);

  const shows = (slug: string) => picked.length === 0 || picked.includes(slug);
  const focused = picked.length === 1;

  // Each tile wears the drawing of its activity, keyed by slug — so a block
  // without a section page of its own (the events of a city with no events
  // page) still has one.
  const imageOf = sectionTileArt;
  const tiles: Tile[] = [
    ...(attractions
      ? [
          {
            slug: "atracciones",
            label: words.map.attractions,
            count: attractions.total,
            image: imageOf("atracciones"),
          },
        ]
      : []),
    ...(events
      ? [
          {
            slug: "eventos",
            label: words.map.events,
            count: events.total,
            image: imageOf("eventos"),
          },
        ]
      : []),
    ...(movies
      ? [
          {
            slug: "cines",
            label: guide.movies,
            count: movies.total,
            image: imageOf("cines"),
          },
        ]
      : []),
    ...sections
      .filter((section) => section.entries.length > 0)
      .map((section) => ({
        slug: section.slug,
        label: section.name,
        count: section.total,
        image: imageOf(section.slug),
      })),
  ];

  const showAttractions = attractions !== null && shows("atracciones");
  const showEvents = events !== null && shows("eventos");
  const showMovies = movies !== null && shows("cines");
  const visibleSections = sections.filter(
    (section) => section.entries.length > 0 && shows(section.slug),
  );

  // Every cinema showing one of these movies, pinned once.
  const cinemaMarkers: MapMarker[] = [
    ...new Map(
      (movies?.cards ?? []).flatMap((movie) =>
        movie.cinemas.map((cinema): [string, MapMarker] => [
          cinema.id,
          {
            id: cinema.id,
            name: `Caribbean Cinemas ${cinema.name}`,
            url: cinema.portalPath,
            address: cinema.address,
            latitude: cinema.lat,
            longitude: cinema.lng,
            logo: "/caribbean-cinemas-logo.png",
          },
        ]),
      ),
    ).values(),
  ];

  // The map shows exactly what is visible, all activity kinds at once — the
  // same results as the cards, not a separate attractions map — and is only
  // offered when something visible has a pin.
  const markers: MapMarker[] = [
    ...(showAttractions ? attractions.markers : []),
    ...(showEvents ? eventMarkers(events.entries) : []),
    ...(showMovies ? cinemaMarkers : []),
    ...visibleSections.flatMap((section) => section.markers),
  ];
  const hasMap = markers.length > 0;
  const view: ListingView = query.vista === "mapa" && hasMap ? "mapa" : "lista";

  // The link beside a block: the count when there is more than the block
  // shows, plain "Ver todos" when the block is already all of it.
  const seeAll = (slug: string, shown: number, total: number) =>
    total > shown
      ? guide.seeAllCount(total, FEMININE_SLUGS.has(slug))
      : guide.seeAll(FEMININE_SLUGS.has(slug));

  // What the page declares to a crawler is what is on it, in order.
  const listed: { name: string; route: { path: string } }[] = [
    ...(showAttractions ? attractions.entries : []),
    ...(showEvents
      ? events.entries.map((event) => ({
          name: event.name,
          route: { path: event.href },
        }))
      : []),
    ...(showMovies
      ? movies.cards.flatMap((movie) =>
          movie.path ? [{ name: movie.name, route: { path: movie.path } }] : [],
        )
      : []),
    ...visibleSections.flatMap((section) => section.entries),
  ];

  return (
    <>
      <JsonLd data={itemListJsonLd(name, listed)} />
      <ListingViews
        header={
          // The planner's controls: the day first, then the activity, with a
          // rule between the two questions.
          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              {guide.when}
            </h2>
            <DateTabs
              locale={locale}
              dates={dates}
              selected={date}
              today={today}
              basePath={basePath}
              query={query}
            />
            {/* Si el plan del día es de playa o de plaza techada lo decide el
                tiempo antes que cualquier otra cosa de la página, así que va
                pegado a la fecha elegida. */}
            <WeatherForecast
              day={weatherOn(weather, date)}
              now={date === today ? (weather?.now ?? null) : null}
              locale={locale}
            />
            {tiles.length > 0 && (
              <div className="mt-5 border-t border-neutral-200 pt-5">
                <ActivityTiles
                  label={guide.what}
                  all={{ label: guide.all, image: sectionTileArt("que-hacer") }}
                  basePath={basePath}
                  query={query}
                  tiles={tiles}
                  picked={picked}
                />
              </div>
            )}
          </div>
        }
        cards={
          // The map view draws no cards, so it does not carry them either.
          view === "mapa" ? null : (
            <>
              {showAttractions && (
                <section className="mt-8">
                  <BlockHeader
                    title={guide.openOn(day)}
                    href={attractions.href}
                    label={seeAll(
                      "atracciones",
                      attractions.entries.length,
                      attractions.total,
                    )}
                  />
                  <div className={CARD_GRID}>
                    {attractions.entries.map((entry) => (
                      <AttractionCard
                        key={entry.id}
                        place={entry}
                        compact
                        locale={locale}
                      />
                    ))}
                  </div>
                </section>
              )}

              {showEvents && (
                <section className="mt-8">
                  <BlockHeader
                    title={
                      events.onDate ? guide.eventsOn(day) : guide.upcomingEvents
                    }
                    href={events.href}
                    label={seeAll(
                      "eventos",
                      events.entries.length,
                      events.total,
                    )}
                  />
                  <div className={CARD_GRID}>
                    {events.entries.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        locale={locale}
                        compact
                      />
                    ))}
                  </div>
                </section>
              )}

              {showMovies && (
                <section className="mt-8">
                  <BlockHeader
                    title={guide.showingOn(day)}
                    href={movies.href}
                    label={seeAll("cines", movies.cards.length, movies.total)}
                  />
                  {/* Alone on the page the full card fits, showtimes and all;
                      in the overview six posters make one row. */}
                  <div className={focused ? CARD_GRID : POSTER_GRID}>
                    {movies.cards.map((movie) => (
                      <MovieCard
                        key={movie.name}
                        movie={movie}
                        compact
                        brief={!focused}
                        showMap={false}
                      />
                    ))}
                  </div>
                </section>
              )}

              {visibleSections.map((section) => (
                <section key={section.id} className="mt-8">
                  <BlockHeader
                    title={section.name}
                    href={section.href}
                    label={seeAll(
                      section.slug,
                      section.entries.length,
                      section.total,
                    )}
                  />
                  <div className={CARD_GRID}>
                    {section.entries.map((entry) => (
                      <PlaceCard
                        key={entry.id}
                        place={entry}
                        compact
                        locale={locale}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )
        }
        markers={view === "mapa" ? markers : []}
        hasMap={hasMap}
        view={view}
        total={tiles.filter((tile) => shows(tile.slug)).length}
        overall={tiles.length}
        gridClassName=""
      />
    </>
  );
}
