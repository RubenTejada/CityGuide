"use client";

import Link from "next/link";
import { useState } from "react";
import { type MovieCardProps } from "@/lib/cinema";
import { sectionIcon } from "@/lib/sections";
import { type UmbracoItem } from "@/lib/umbraco";
import AttractionCard from "./AttractionCard";
import MovieCard from "./cine/MovieCard";
import MarkersMap, { type MapMarker } from "./MarkersMap";
import { EventCard, eventMarkers, type EventEntry } from "./EventsList";
import FilterDropdown from "./FilterDropdown";
import PlaceCard from "./PlaceCard";
import ViewToggle, { type ListingView } from "./ViewToggle";

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

export default function ThingsToDoExplorer({
  events,
  attractions,
  attractionMarkers,
  attractionsHref,
  movies,
  moviesHref,
  sections,
}: {
  events: EventEntry[];
  attractions: UmbracoItem[];
  attractionMarkers: MapMarker[];
  attractionsHref: string | null;
  /** Today's most-shown movies: the cinemas section is a cartelera, not a list. */
  movies: MovieCardProps[];
  moviesHref: string | null;
  sections: GuideSection[];
}) {
  // Empty = everything; otherwise "eventos", "atracciones", "cines" and/or
  // section slugs, as many as the visitor ticks.
  const [activities, setActivities] = useState<string[]>([]);
  const [view, setView] = useState<ListingView>("lista");

  const shows = (slug: string) =>
    activities.length === 0 || activities.includes(slug);
  const visibleSections = sections.filter(
    (s) => s.entries.length > 0 && shows(s.slug),
  );
  const showEvents = shows("eventos");
  const showAttractions = shows("atracciones");
  const showMovies = movies.length > 0 && shows("cines");

  // What the "Actividad" dropdown offers: the two aggregations, the cartelera
  // when there is one, and every section that has entries. The dropdown ticks
  // by label, so each option carries the slug the filters are keyed by.
  const activityOptions: { slug: string; label: string }[] = [
    { slug: "atracciones", label: "Atracciones" },
    { slug: "eventos", label: "Eventos" },
    ...(movies.length > 0 ? [{ slug: "cines", label: "Cines" }] : []),
    ...sections
      .filter((s) => s.entries.length > 0)
      .map((s) => ({ slug: s.slug, label: s.name })),
  ];

  const nothingVisible =
    !showEvents &&
    !showAttractions &&
    !showMovies &&
    visibleSections.length === 0;

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
    ...visibleSections.flatMap((s) => s.markers),
  ];
  const mappable =
    attractionMarkers.length > 0 ||
    eventMarkers(events).length > 0 ||
    cinemaMarkers.length > 0 ||
    sections.some((s) => s.markers.length > 0);

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <FilterDropdown
          label="Actividad"
          options={activityOptions.map((o) => o.label)}
          selected={activityOptions
            .filter((o) => activities.includes(o.slug))
            .map((o) => o.label)}
          onToggle={(label) => {
            const slug = activityOptions.find((o) => o.label === label)?.slug;
            if (!slug) return;
            setActivities((picks) =>
              picks.includes(slug)
                ? picks.filter((p) => p !== slug)
                : [...picks, slug],
            );
          }}
          icons={Object.fromEntries(
            activityOptions.map((o) => [o.label, sectionIcon(o.slug)]),
          )}
          className="relative"
        />
        {mappable && <ViewToggle value={view} onChange={setView} />}
      </div>

      {view === "mapa" && (
        <div className="mt-6">
          {markers.length === 0 ? (
            <p className="text-neutral-500">
              Ninguna de estas actividades tiene ubicación en el mapa.
            </p>
          ) : (
            <MarkersMap
              markers={markers}
              locate
              heightClass="h-[26rem] lg:h-[34rem]"
            />
          )}
        </div>
      )}

      {view === "lista" && (
        <>

          {showAttractions && (
            <section className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Parques y atracciones abiertos hoy
                </h2>
                {attractionsHref && (
                  <Link
                    href={attractionsHref}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Ver todas
                  </Link>
                )}
              </div>
              <div className={CARD_GRID}>
                {attractions.map((entry) => (
                  <AttractionCard key={entry.id} place={entry} compact />
                ))}
                {attractions.length === 0 && (
                  <p className="text-neutral-500">
                    No hay atracciones abiertas hoy.
                  </p>
                )}
              </div>
            </section>
          )}

          {showEvents && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold">Eventos próximos</h2>
              <div className={CARD_GRID}>
                {events.map((event) => (
                  <EventCard key={event.id} event={event} compact />
                ))}
              </div>
              {events.length === 0 && (
                <p className="mt-4 text-neutral-500">
                  No hay eventos próximos publicados todavía.
                </p>
              )}
            </section>
          )}

          {showMovies && (
            <section className="mt-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  En cartelera hoy
                </h2>
                {moviesHref && (
                  <Link
                    href={moviesHref}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Ver cartelera completa
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
                  Ver todos
                </Link>
              </div>
              <div className={CARD_GRID}>
                {section.entries.map((entry) => (
                  <PlaceCard key={entry.id} place={entry} compact />
                ))}
              </div>
            </section>
          ))}

          {nothingVisible && (
            <p className="mt-8 text-neutral-500">
              No encontramos actividades con esos filtros. Prueba con otra
              combinación.
            </p>
          )}
        </>
      )}
    </div>
  );
}
