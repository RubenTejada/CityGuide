"use client";

import Link from "next/link";
import { useState } from "react";
import { num, text, type UmbracoItem } from "@/lib/umbraco";
import AttractionCard from "./AttractionCard";
import BranchesMap, { type BranchMarker } from "./BranchesMap";
import { EventCard, type EventEntry } from "./EventsList";
import FilterPills from "./FilterPills";
import PlaceCard from "./PlaceCard";

export interface GuideSection {
  id: string;
  name: string;
  slug: string;
  href: string;
  entries: UmbracoItem[];
}

export default function ThingsToDoExplorer({
  events,
  attractions,
  attractionsHref,
  sections,
}: {
  events: EventEntry[];
  attractions: UmbracoItem[];
  attractionsHref: string | null;
  sections: GuideSection[];
}) {
  // null = everything; otherwise "eventos", "atracciones", or a section slug.
  const [activity, setActivity] = useState<string | null>(null);

  const visibleSections = sections.filter(
    (s) =>
      s.entries.length > 0 && (activity === null || activity === s.slug),
  );
  const showEvents = activity === null || activity === "eventos";
  const showAttractions = activity === null || activity === "atracciones";

  const nothingVisible =
    !showEvents && !showAttractions && visibleSections.length === 0;

  const attractionMarkers: BranchMarker[] = attractions
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      url: entry.route.path,
      address: text(entry, "address") || null,
      latitude: num(entry, "latitude"),
      longitude: num(entry, "longitude"),
      logo: null,
    }))
    .filter((m) => m.latitude !== 0 && m.longitude !== 0);

  return (
    <div>
      <FilterPills
        options={[
          { value: "eventos", label: "Eventos" },
          { value: "atracciones", label: "Atracciones" },
          ...sections
            .filter((s) => s.entries.length > 0)
            .map((s) => ({ value: s.slug, label: s.name })),
        ]}
        value={activity}
        onChange={setActivity}
        allLabel="Todo"
        className="mt-8 flex flex-wrap gap-2"
      />

      {showEvents && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Eventos próximos</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
          {events.length === 0 && (
            <p className="mt-4 text-neutral-500">
              No hay eventos próximos publicados todavía.
            </p>
          )}
        </section>
      )}

      {showAttractions && (
        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
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
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {attractions.map((entry) => (
              <AttractionCard key={entry.id} place={entry} />
            ))}
            {attractions.length === 0 && (
              <p className="text-neutral-500">No hay atracciones abiertas hoy.</p>
            )}
          </div>
        </section>
      )}

      {visibleSections.map((section) => (
        <section key={section.id} className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{section.name}</h2>
            <Link
              href={section.href}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {section.entries.map((entry) => (
              <PlaceCard key={entry.id} place={entry} />
            ))}
          </div>
        </section>
      ))}

      {showAttractions && attractionMarkers.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Mapa de atracciones</h2>
          <div className="mt-5">
            <BranchesMap branches={attractionMarkers} />
          </div>
        </section>
      )}

      {nothingVisible && (
        <p className="mt-10 text-neutral-500">
          No encontramos actividades con esos filtros. Prueba con otra
          combinación.
        </p>
      )}
    </div>
  );
}
