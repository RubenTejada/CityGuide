"use client";

import Link from "next/link";
import { useState } from "react";
import type { UmbracoItem } from "@/lib/umbraco";
import { EventCard, type EventEntry } from "./EventsList";
import PlaceCard from "./PlaceCard";

export interface GuideSection {
  id: string;
  name: string;
  slug: string;
  href: string;
  entries: UmbracoItem[];
}

type Audience = "familia" | "pareja" | "amigos";

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "familia", label: "En familia" },
  { value: "pareja", label: "En pareja" },
  { value: "amigos", label: "Con amigos" },
];

/** Which audiences a guide section fits; unknown slugs fit everyone. */
const SECTION_AUDIENCES: Record<string, Audience[]> = {
  "bares-y-clubes": ["amigos", "pareja"],
  restaurantes: ["familia", "pareja", "amigos"],
  cines: ["familia", "pareja", "amigos"],
  tiendas: ["familia", "amigos"],
  atracciones: ["familia", "pareja", "amigos"],
};

function sectionFits(slug: string, audience: Audience | null): boolean {
  if (!audience) return true;
  const fits = SECTION_AUDIENCES[slug];
  return !fits || fits.includes(audience);
}

/** Audiences an event fits, inferred from its free-text category. */
function eventFits(category: string, audience: Audience | null): boolean {
  if (!audience) return true;
  const c = category.toLowerCase();
  if (/concierto|música|musica|fiesta|nocturn|club/.test(c))
    return audience !== "familia";
  if (/infantil|niñ|feria|familiar/.test(c)) return audience === "familia";
  return true;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
        active
          ? "border-amber-600 bg-amber-600 text-white"
          : "border-neutral-300 bg-white text-neutral-700 hover:border-amber-600 hover:text-amber-700"
      }`}
    >
      {children}
    </button>
  );
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
  const [audience, setAudience] = useState<Audience | null>(null);

  const visibleSections = sections.filter(
    (s) =>
      s.entries.length > 0 &&
      (activity === null || activity === s.slug) &&
      sectionFits(s.slug, audience),
  );
  const showEvents =
    (activity === null || activity === "eventos") &&
    (!audience || events.some((e) => eventFits(e.category, audience)));
  const filteredEvents = events.filter((e) => eventFits(e.category, audience));
  const showAttractions =
    (activity === null || activity === "atracciones") &&
    sectionFits("atracciones", audience);

  const nothingVisible =
    !showEvents && !showAttractions && visibleSections.length === 0;

  return (
    <div>
      <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          ¿Qué te apetece?
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip active={activity === null} onClick={() => setActivity(null)}>
            Todo
          </Chip>
          <Chip
            active={activity === "eventos"}
            onClick={() => setActivity("eventos")}
          >
            Eventos
          </Chip>
          <Chip
            active={activity === "atracciones"}
            onClick={() => setActivity("atracciones")}
          >
            Atracciones
          </Chip>
          {sections
            .filter((s) => s.entries.length > 0)
            .map((s) => (
              <Chip
                key={s.id}
                active={activity === s.slug}
                onClick={() => setActivity(s.slug)}
              >
                {s.name}
              </Chip>
            ))}
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          ¿Con quién?
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip active={audience === null} onClick={() => setAudience(null)}>
            Todos
          </Chip>
          {AUDIENCES.map(({ value, label }) => (
            <Chip
              key={value}
              active={audience === value}
              onClick={() => setAudience(value)}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>

      {showEvents && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Eventos próximos</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {filteredEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
          {filteredEvents.length === 0 && (
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
                className="text-sm font-medium text-amber-600 hover:underline"
              >
                Ver todas
              </Link>
            )}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {attractions.map((entry) => (
              <PlaceCard key={entry.id} place={entry} />
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
              className="text-sm font-medium text-amber-600 hover:underline"
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

      {nothingVisible && (
        <p className="mt-10 text-neutral-500">
          No encontramos actividades con esos filtros. Prueba con otra
          combinación.
        </p>
      )}
    </div>
  );
}
