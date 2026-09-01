"use client";

import Link from "next/link";
import { useState } from "react";
import MarkersMap, { type MapMarker } from "@/components/MarkersMap";
import TrailerModal from "@/components/cine/TrailerModal";
import { type MovieCardProps } from "@/lib/cinema";

/**
 * One movie in the cartelera: header with poster/meta/trailer, expandable
 * detail with per-cinema showtimes (booking links) and a map of the cinemas
 * showing it. The map only mounts when the detail is opened.
 * `compact` stacks the poster over the text so the card fits a grid column
 * ("Qué Hacer"); the wide layout is the cartelera's own list.
 */
export default function MovieCard({
  movie,
  showMap = true,
  compact = false,
}: {
  movie: MovieCardProps;
  showMap?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const totalShowtimes = movie.cinemas.reduce(
    (sum, c) => sum + c.showtimes.length,
    0,
  );

  const markers: MapMarker[] = movie.cinemas.map((c) => ({
    id: c.id,
    name: `Caribbean Cinemas ${c.name}`,
    url: c.portalPath,
    address: c.address,
    latitude: c.lat,
    longitude: c.lng,
    logo: "/caribbean-cinemas-logo.png",
  }));

  return (
    <article className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className={compact ? "p-3" : "flex gap-4 p-4"}>
        {movie.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={movie.poster}
            alt={`Afiche de ${movie.name}`}
            loading="lazy"
            className={
              compact
                ? "mb-3 aspect-[2/3] w-full rounded-lg object-cover"
                : "h-36 w-24 flex-none rounded-lg object-cover sm:h-44 sm:w-28"
            }
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className={compact ? "font-semibold" : "text-lg font-semibold"}>
              {movie.name}
            </h3>
            {movie.trailerYoutubeId && (
              <TrailerModal
                youtubeId={movie.trailerYoutubeId}
                movieName={movie.name}
              />
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {[
              movie.rating,
              movie.duration ? `${movie.duration} min` : null,
              movie.genre,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-sm font-medium text-brand-700">
            {movie.cinemas.length}{" "}
            {movie.cinemas.length === 1 ? "cine" : "cines"} · {totalShowtimes}{" "}
            {totalShowtimes === 1 ? "función" : "funciones"}
          </p>
          {movie.synopsis && (
            <p
              className={
                compact
                  ? "mt-2 line-clamp-2 text-xs text-neutral-600"
                  : "mt-2 line-clamp-2 hidden text-sm text-neutral-600 sm:block"
              }
            >
              {movie.synopsis}
            </p>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={`mt-3 inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 font-medium text-white hover:bg-neutral-700 ${
              compact ? "px-3 py-1.5 text-xs" : "px-4 py-1.5 text-sm"
            }`}
          >
            {open ? "Ocultar horarios" : "Ver horarios y cines"}
            <span aria-hidden className="text-xs">
              {open ? "▲" : "▼"}
            </span>
          </button>
        </div>
      </div>

      {open && (
        <div
          className={`grid gap-6 border-t border-neutral-200 ${
            compact ? "p-3" : "p-4"
          } ${showMap ? "lg:grid-cols-2" : ""}`}
        >
          <div className="space-y-4">
            {movie.cinemas.map((cinema) => (
              <div key={cinema.id}>
                <p className="font-semibold">
                  <Link
                    href={cinema.portalPath}
                    className="hover:text-brand-600"
                  >
                    🎬 Caribbean Cinemas {cinema.name}
                  </Link>
                </p>
                <p className="text-xs text-neutral-500">{cinema.address}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {cinema.showtimes.map((showtime) => (
                    <a
                      key={showtime.id}
                      href={showtime.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Reservar en ${cinema.name}`}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {showtime.time}
                      {showtime.badge && (
                        <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-neutral-400">
                          {showtime.badge}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {showMap && (
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-600">
                Cines que presentan {movie.name}
              </p>
              <MarkersMap markers={markers} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
