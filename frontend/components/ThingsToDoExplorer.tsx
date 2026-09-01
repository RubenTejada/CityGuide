"use client";

import Link from "next/link";
import { useState } from "react";
import { type MovieCardProps } from "@/lib/cinema";
import { type UmbracoItem } from "@/lib/umbraco";
import AttractionCard from "./AttractionCard";
import MovieCard from "./cine/MovieCard";
import MarkersMap, { type MapMarker } from "./MarkersMap";
import { EventCard, eventMarkers, type EventEntry } from "./EventsList";
import FilterPills from "./FilterPills";
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
  // null = everything; otherwise "eventos", "atracciones", "cines" or a
  // section slug.
  const [activity, setActivity] = useState<string | null>(null);
  const [view, setView] = useState<ListingView>("lista");

  const visibleSections = sections.filter(
    (s) =>
      s.entries.length > 0 && (activity === null || activity === s.slug),
  );
  const showEvents = activity === null || activity === "eventos";
  const showAttractions = activity === null || activity === "atracciones";
  const showMovies =
    movies.length > 0 && (activity === null || activity === "cines");

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
        <FilterPills
          options={[
            { value: "atracciones", label: "Atracciones" },
            { value: "eventos", label: "Eventos" },
            ...(movies.length > 0
              ? [{ value: "cines", label: "Cines" }]
              : []),
            ...sections
              .filter((s) => s.entries.length > 0)
              .map((s) => ({ value: s.slug, label: s.name })),
          ]}
          value={activity}
          onChange={setActivity}
          allLabel="Todo"
          className="flex flex-wrap gap-2"
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
