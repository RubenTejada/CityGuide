"use client";

import Link from "next/link";
import { useState } from "react";
import MovieReviewBadges from "@/components/cine/MovieReviewBadges";
import MovieShowtimes from "@/components/cine/MovieShowtimes";
import TrailerModal from "@/components/cine/TrailerModal";
import { type MovieCardProps } from "@/lib/cinema";

/**
 * One movie in the cartelera: header with poster/meta/trailer/reviews, and an
 * expandable detail with per-cinema showtimes (booking links) and a map of the
 * cinemas showing it. The map only mounts when the detail is opened.
 * The title links to the movie's own page when the CMS catalog has it.
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

  const poster = movie.poster && (
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
  );

  return (
    <article className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className={compact ? "p-3" : "flex gap-4 p-4"}>
        {movie.path && poster ? (
          <Link href={movie.path} className={compact ? "block" : "flex-none"}>
            {poster}
          </Link>
        ) : (
          poster
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className={compact ? "font-semibold" : "text-lg font-semibold"}>
              {movie.path ? (
                <Link href={movie.path} className="hover:text-brand-600">
                  {movie.name}
                </Link>
              ) : (
                movie.name
              )}
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
          <div className="mt-2">
            <MovieReviewBadges
              movieName={movie.name}
              reviews={movie.reviews}
              size="sm"
            />
          </div>
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 font-medium text-white hover:bg-neutral-700 ${
                compact ? "px-3 py-1.5 text-xs" : "px-4 py-1.5 text-sm"
              }`}
            >
              {open ? "Ocultar horarios" : "Ver horarios y cines"}
              <span aria-hidden className="text-xs">
                {open ? "▲" : "▼"}
              </span>
            </button>
            {movie.path && (
              <Link
                href={movie.path}
                className={`inline-flex items-center rounded-lg border border-neutral-300 bg-white font-medium hover:border-brand-500 hover:text-brand-600 ${
                  compact ? "px-3 py-1.5 text-xs" : "px-4 py-1.5 text-sm"
                }`}
              >
                Ver detalle
              </Link>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-neutral-200">
          <MovieShowtimes
            movieName={movie.name}
            cinemas={movie.cinemas}
            showMap={showMap}
            compact={compact}
          />
        </div>
      )}
    </article>
  );
}
