import Link from "next/link";
import ListingViews from "@/components/ListingViews";
import { type MovieCardProps } from "@/lib/cinema";
import { t as dictionary, type Locale } from "@/lib/i18n";
import {
  selectedFilters,
  type FilterGroup,
  type ListingQuery,
} from "@/lib/listing";
import { sectionIcon } from "@/lib/sections";
import { type UmbracoItem } from "@/lib/umbraco";
import AttractionCard from "./AttractionCard";
import MovieCard from "./cine/MovieCard";
import { type MapMarker } from "./MarkersMap";
import { EventCard, eventMarkers, type EventEntry } from "./EventsList";
import PlaceCard from "./PlaceCard";
import { type ListingView } from "./ViewToggle";

export interface GuideSection {
  id: string;
  name: string;
  slug: string;
  href: string;
  entries: UmbracoItem[];
  /** The pins those entries put on the map view (a company pins its branches). */
  markers: MapMarker[];
}

/** Cards are dense on purpose: three across on wide screens, two on tablets. */
const CARD_GRID = "mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3";

/**
 * The "Qué Hacer" guide: the aggregations (attractions open today, upcoming
 * events, today's cartelera) and one block per section, narrowed by an
 * "Actividad" dropdown and shown as cards or as one map of everything visible.
 *
 * Which activities are shown is read from the query string and settled here,
 * on the server, like every other listing of the portal — so the page is a
 * link someone can share, Back walks the picks, and the map view carries the
 * pins without also carrying every card nobody is looking at. There is no
 * pagination: each block is already a capped selection with a link to the
 * section that holds the rest.
 */
export default function ThingsToDoExplorer({
  locale,
  query,
  events,
  attractions,
  attractionMarkers,
  attractionsHref,
  movies,
  moviesHref,
  sections,
}: {
  locale: Locale;
  query: ListingQuery;
  events: EventEntry[];
  attractions: UmbracoItem[];
  attractionMarkers: MapMarker[];
  attractionsHref: string | null;
  /** Today's most-shown movies: the cinemas section is a cartelera, not a list. */
  movies: MovieCardProps[];
  moviesHref: string | null;
  sections: GuideSection[];
}) {
  const words = dictionary(locale);

  // What the "Actividad" dropdown offers: the two aggregations, the cartelera
  // when there is one, and every section that has entries. The dropdown ticks
  // by label, so each option carries the slug the filters are keyed by.
  const activityOptions: { slug: string; label: string }[] = [
    { slug: "atracciones", label: words.map.attractions },
    { slug: "eventos", label: words.map.events },
    ...(movies.length > 0 ? [{ slug: "cines", label: words.map.cinemas }] : []),
    ...sections
      .filter((section) => section.entries.length > 0)
      .map((section) => ({ slug: section.slug, label: section.name })),
  ];
  const group: FilterGroup = {
    key: "actividad",
    label: words.map.activity,
    options: activityOptions.map((option) => option.label),
    // The dropdown picks whole blocks, not entries, so it filters below rather
    // than through `filterEntries`.
    valuesByEntry: {},
    match: "any",
    icons: Object.fromEntries(
      activityOptions.map((option) => [option.label, sectionIcon(option.slug)]),
    ),
  };
  const selected = selectedFilters([group], query);
  const picked = new Set(
    (selected[group.key] ?? []).flatMap((label) => {
      const option = activityOptions.find((entry) => entry.label === label);
      return option ? [option.slug] : [];
    }),
  );
  // Nothing ticked is everything shown, which is what the dropdown reads as.
  const shows = (slug: string) => picked.size === 0 || picked.has(slug);

  const showAttractions = shows("atracciones");
  const showEvents = shows("eventos");
  const showMovies = movies.length > 0 && shows("cines");
  const visibleSections = sections.filter(
    (section) => section.entries.length > 0 && shows(section.slug),
  );

  const view: ListingView = query.vista === "mapa" ? "mapa" : "lista";

  // Every cinema showing one of these movies, pinned once.
  const cinemaMarkers: MapMarker[] = [
    ...new Map(
      movies.flatMap((movie) =>
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

  // The map shows exactly what the filters left visible, all activity kinds
  // at once — the same results as the cards, not a separate attractions map.
  const markers: MapMarker[] = [
    ...(showAttractions ? attractionMarkers : []),
    ...(showEvents ? eventMarkers(events) : []),
    ...(showMovies ? cinemaMarkers : []),
    ...visibleSections.flatMap((section) => section.markers),
  ];
  const hasMap =
    attractionMarkers.length > 0 ||
    eventMarkers(events).length > 0 ||
    cinemaMarkers.length > 0 ||
    sections.some((section) => section.markers.length > 0);

  return (
    <ListingViews
      cards={
        // The map view draws no cards, so it does not carry them either.
        view === "mapa" ? null : (
          <>
            {showAttractions && (
              <section className="mt-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {words.thingsToDo.openToday}
                  </h2>
                  {attractionsHref && (
                    <Link
                      href={attractionsHref}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {words.thingsToDo.seeAllFeminine}
                    </Link>
                  )}
                </div>
                <div className={CARD_GRID}>
                  {attractions.map((entry) => (
                    <AttractionCard
                      key={entry.id}
                      place={entry}
                      compact
                      locale={locale}
                    />
                  ))}
                  {attractions.length === 0 && (
                    <p className="text-neutral-500">
                      {words.thingsToDo.noneOpenToday}
                    </p>
                  )}
                </div>
              </section>
            )}

            {showEvents && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold">
                  {words.thingsToDo.upcomingEvents}
                </h2>
                <div className={CARD_GRID}>
                  {events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      locale={locale}
                      compact
                    />
                  ))}
                </div>
                {events.length === 0 && (
                  <p className="mt-4 text-neutral-500">
                    {words.thingsToDo.noUpcomingEvents}
                  </p>
                )}
              </section>
            )}

            {showMovies && (
              <section className="mt-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {words.thingsToDo.showingToday}
                  </h2>
                  {moviesHref && (
                    <Link
                      href={moviesHref}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {words.thingsToDo.fullListings}
                    </Link>
                  )}
                </div>
                <div className={CARD_GRID}>
                  {movies.map((movie) => (
                    <MovieCard
                      key={movie.name}
                      movie={movie}
                      compact
                      showMap={false}
                    />
                  ))}
                </div>
              </section>
            )}

            {visibleSections.map((section) => (
              <section key={section.id} className="mt-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{section.name}</h2>
                  <Link
                    href={section.href}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    {words.thingsToDo.seeAll}
                  </Link>
                </div>
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
      filters={[
        {
          key: group.key,
          label: group.label,
          options: group.options,
          icons: group.icons,
        },
      ]}
      selected={selected}
      view={view}
      total={activityOptions.filter((option) => shows(option.slug)).length}
      overall={activityOptions.length}
      noMatchesLabel={words.thingsToDo.noMatches}
      gridClassName=""
    />
  );
}
