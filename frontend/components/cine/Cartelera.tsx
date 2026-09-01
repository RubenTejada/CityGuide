import Link from "next/link";
import MovieCard, { type MovieCardProps } from "@/components/cine/MovieCard";
import {
  bookingUrl,
  CINEMAS_BY_CITY,
  cinemaPortalPath,
  getAvailableDates,
  getMovieBillboard,
  posterUrl,
  todayInDR,
  type Cinema,
} from "@/lib/cinema";
import { getDescendantsOfType, text } from "@/lib/umbraco";

function dateLabel(date: string, today: string): string {
  if (date === today) return "Hoy";
  const d = new Date(`${date}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  if (d.getTime() - t.getTime() === 86_400_000) return "Mañana";
  return new Intl.DateTimeFormat("es-DO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

/**
 * Live cartelera from Caribbean Cinemas, grouped by movie (most cinemas and
 * showtimes first). Each movie expands into per-cinema showtimes with booking
 * links and a map of the cinemas showing it. Date via ?fecha=YYYY-MM-DD.
 * With `cinema` set, only that cinema's showings are listed (branch page)
 * and the per-movie map is omitted — the branch page has its own map.
 */
export default async function Cartelera({
  citySlug,
  basePath,
  selectedDate,
  cinema,
}: {
  citySlug: string;
  basePath: string;
  selectedDate?: string;
  cinema?: Cinema;
}) {
  const today = todayInDR();
  const siteIds = cinema
    ? [cinema.id]
    : (CINEMAS_BY_CITY[citySlug] ?? []).map((c) => c.id);
  const [dates, cmsMovies] = await Promise.all([
    getAvailableDates(siteIds),
    // Agent-maintained movie catalog: stable trailer picks live in the CMS.
    getDescendantsOfType(`/${citySlug}/cines`, "movie"),
  ]);
  const knownTrailers: Record<string, string> = {};
  for (const movie of cmsMovies) {
    const id = text(movie, "trailerYoutubeId");
    if (id) knownTrailers[movie.name.toLowerCase()] = id;
  }
  const date =
    selectedDate && dates.includes(selectedDate)
      ? selectedDate
      : (dates[0] ?? today);
  let billboard = await getMovieBillboard(citySlug, date, knownTrailers);

  if (cinema) {
    billboard = billboard
      .map((movie) => ({
        ...movie,
        cinemas: movie.cinemas.filter((c) => c.cinema.id === cinema.id),
      }))
      .filter((movie) => movie.cinemas.length > 0)
      .sort(
        (a, b) =>
          b.cinemas[0].showtimes.length - a.cinemas[0].showtimes.length ||
          a.name.localeCompare(b.name, "es"),
      );
  }

  const cards: MovieCardProps[] = billboard.map((movie) => ({
    name: movie.name,
    poster: posterUrl(movie.posterImage),
    rating: movie.rating,
    duration: movie.duration,
    genre: movie.genre,
    synopsis: movie.synopsis?.replace(/<[^>]+>/g, "") ?? null,
    trailerYoutubeId: movie.trailerYoutubeId,
    cinemas: movie.cinemas.map(({ cinema, showtimes }) => ({
      id: cinema.id,
      name: cinema.name,
      address: cinema.address,
      lat: cinema.lat,
      lng: cinema.lng,
      portalPath: cinemaPortalPath(citySlug, cinema),
      showtimes: showtimes.map((showtime) => ({
        id: showtime.id,
        time: showtime.time,
        badge: showtime.badges[0] ?? null,
        bookingUrl: bookingUrl(cinema, showtime.id),
      })),
    })),
  }));

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">Cartelera</h2>
        <p className="text-sm text-neutral-500">
          Horarios y reservas vía{" "}
          <a
            href="https://rd.caribbeancinemas.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-amber-600 hover:underline"
          >
            Caribbean Cinemas
          </a>
        </p>
      </div>

      {dates.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {dates.map((d) => (
            <Link
              key={d}
              href={d === dates[0] ? basePath : `${basePath}?fecha=${d}`}
              className={
                d === date
                  ? "rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white"
                  : "rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-sm font-medium hover:border-amber-500 hover:text-amber-600"
              }
            >
              {dateLabel(d, today)}
            </Link>
          ))}
        </div>
      )}

      {cards.length === 0 ? (
        <p className="mt-6 text-neutral-500">
          No pudimos cargar la cartelera en este momento. Inténtalo más tarde o
          visita{" "}
          <a
            href="https://rd.caribbeancinemas.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-600 hover:underline"
          >
            caribbeancinemas.com
          </a>
          .
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {cards.map((card) => (
            <MovieCard key={card.name} movie={card} showMap={!cinema} />
          ))}
        </div>
      )}
    </section>
  );
}
