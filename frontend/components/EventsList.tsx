import Image from "next/image";
import Link from "next/link";
import { INTL_LOCALE, type Locale } from "@/lib/i18n";
import { num, photoUrl, text, type UmbracoItem } from "@/lib/umbraco";
import { type MapMarker } from "./MarkersMap";

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

/** A published `eventItem` as the cards, the map and the guide read it. */
export function eventEntry(event: UmbracoItem): EventEntry {
  return {
    id: event.id,
    href: event.route.path,
    name: event.name,
    category: text(event, "category"),
    startDate:
      typeof event.properties["startDate"] === "string"
        ? event.properties["startDate"]
        : "",
    endDate:
      typeof event.properties["endDate"] === "string"
        ? event.properties["endDate"]
        : "",
    venueName: text(event, "venueName"),
    description: text(event, "description"),
    photo: photoUrl(event),
    latitude: num(event, "latitude"),
    longitude: num(event, "longitude"),
  };
}

/** The events that carry coordinates, as map pins. */
export function eventMarkers(events: EventEntry[]): MapMarker[] {
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

/** Whether the event is over, which is what files it under "Eventos pasados". */
export function isPastEvent(event: EventEntry): boolean {
  const end = new Date(event.endDate || event.startDate);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() < Date.now();
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        dateStyle: "long",
      }).format(date);
}

/** The heading one month's events sit under ("Octubre 2026"). */
export function monthLabel(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const label = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    month: "long",
    year: "numeric",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * `compact` trades the tall poster and the roomy padding for a denser card, so
 * a listing fits three across and more of it lands above the fold.
 */
export function EventCard({
  event,
  locale,
  compact = false,
}: {
  event: EventEntry;
  locale: Locale;
  compact?: boolean;
}) {
  return (
    <Link
      href={event.href}
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
    >
      {event.photo && (
        <div
          className={`relative bg-neutral-200 ${
            compact ? "aspect-[16/7]" : "aspect-[2/1]"
          }`}
        >
          <Image
            src={event.photo}
            alt={event.name}
            fill
            className="object-cover"
            // A compact card is never wider than a third of the 6xl grid, and
            // the home page's column is narrower still: asking for viewport
            // fractions there downloaded a 1080px poster for a 320px card.
            sizes={
              compact
                ? "(min-width: 640px) 360px, 100vw"
                : "(min-width: 768px) 50vw, 100vw"
            }
          />
        </div>
      )}
      <div className={compact ? "p-3" : "p-5"}>
        <div className="flex items-start justify-between gap-3">
          {/* Two lines, whether the title fills them or not: a compact card is
              one slot of the home page's ticker and one cell of the guide's
              grid, and both read straight only when every card is the same
              height. `min-h-10` is those two lines of `text-sm`. */}
          <h3
            className={`font-semibold ${
              compact ? "line-clamp-2 min-h-10 text-sm" : ""
            }`}
          >
            {event.name}
          </h3>
          {event.category && (
            <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800">
              {event.category}
            </span>
          )}
        </div>
        <p
          className={`text-brand-700 ${compact ? "mt-0.5 text-xs" : "mt-1 text-sm"}`}
        >
          {formatDate(event.startDate, locale)}
        </p>
        <p
          className={`truncate text-neutral-500 ${
            compact ? "mt-0.5 text-xs" : "mt-1 text-sm"
          }`}
        >
          {event.venueName}
        </p>
        <p
          className={`text-neutral-600 ${
            compact
              ? "mt-1 line-clamp-2 min-h-8 text-xs"
              : "mt-2 line-clamp-3 text-sm"
          }`}
        >
          {event.description}
        </p>
      </div>
    </Link>
  );
}
