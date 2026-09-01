"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import FilterPills from "./FilterPills";
import MarkersMap, { type MapMarker } from "./MarkersMap";
import ViewToggle, { type ListingView } from "./ViewToggle";

export interface EventEntry {
  id: string;
  href: string;
  name: string;
  category: string;
  startDate: string;
  endDate: string;
  venueName: string;
  description: string;
  photo: string | null;
  latitude: number;
  longitude: number;
}

/** The events that carry coordinates, as map pins. */
function eventMarkers(events: EventEntry[]): MapMarker[] {
  return events
    .filter((event) => event.latitude !== 0 && event.longitude !== 0)
    .map((event) => ({
      id: event.id,
      name: event.name,
      url: event.href,
      address: event.venueName || null,
      latitude: event.latitude,
      longitude: event.longitude,
      // An event has no company logo: the pin shows the section glyph and the
      // poster stays in the popup card.
      logo: null,
      photo: event.photo,
    }));
}

const monthFormat = new Intl.DateTimeFormat("es-DO", {
  month: "long",
  year: "numeric",
});
const dateFormat = new Intl.DateTimeFormat("es-DO", { dateStyle: "long" });

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date);
}

function monthLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha por confirmar";
  const label = monthFormat.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function isPast(event: EventEntry): boolean {
  const end = new Date(event.endDate || event.startDate);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() < Date.now();
}

export function EventCard({ event }: { event: EventEntry }) {
  return (
    <Link
      href={event.href}
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
    >
      {event.photo && (
        <div className="relative aspect-[2/1] bg-neutral-200">
          <Image
            src={event.photo}
            alt={event.name}
            fill
            className="object-cover"
            sizes="(min-width: 768px) 50vw, 100vw"
          />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{event.name}</h3>
          {event.category && (
            <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800">
              {event.category}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-brand-700">{formatDate(event.startDate)}</p>
        <p className="mt-1 text-sm text-neutral-500">{event.venueName}</p>
        <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{event.description}</p>
      </div>
    </Link>
  );
}

export default function EventsList({ events }: { events: EventEntry[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [view, setView] = useState<ListingView>("lista");

  const categories = useMemo(
    () =>
      [...new Set(events.map((e) => e.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [events],
  );

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      ),
    [events],
  );

  const filtered = category
    ? sorted.filter((e) => e.category === category)
    : sorted;

  const upcoming = filtered.filter((e) => !isPast(e));
  const past = filtered.filter(isPast);

  const byMonth = new Map<string, EventEntry[]>();
  for (const event of upcoming) {
    const label = monthLabel(event.startDate);
    const group = byMonth.get(label);
    if (group) group.push(event);
    else byMonth.set(label, [event]);
  }

  const markers = eventMarkers(filtered);
  const mappable = eventMarkers(events).length > 0;

  return (
    <div>
      {(categories.length > 1 || mappable) && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {categories.length > 1 && (
            <FilterPills
              options={categories.map((c) => ({ value: c, label: c }))}
              value={category}
              onChange={setCategory}
              allLabel="Todas"
              className="flex flex-wrap gap-2"
            />
          )}
          {mappable && <ViewToggle value={view} onChange={setView} />}
        </div>
      )}

      {view === "mapa" && filtered.length > 0 && (
        <div className="mt-8">
          {markers.length === 0 ? (
            <p className="text-neutral-500">
              Ninguno de estos eventos tiene ubicación en el mapa.
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

      {view === "lista" &&
        [...byMonth.entries()].map(([label, group]) => (
          <section key={label} className="mt-8">
            <h2 className="text-lg font-semibold text-neutral-800">{label}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {group.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        ))}

      {view === "lista" && past.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-neutral-500">Eventos pasados</h2>
          <div className="mt-4 grid gap-4 opacity-70 md:grid-cols-2">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <p className="mt-8 text-neutral-500">No hay eventos publicados todavía.</p>
      )}
    </div>
  );
}
