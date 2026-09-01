import { PendingArea } from "@/components/LoadingOverlay";
import DateTabs from "@/components/cine/DateTabs";
import MovieCard from "@/components/cine/MovieCard";
import {
  CINEMAS_BY_CITY,
  getAvailableDates,
  getMovieCatalog,
  getMovieBillboard,
  todayInDR,
  toMovieCards,
  type Cinema,
} from "@/lib/cinema";

/**
 * Live cartelera from Caribbean Cinemas, grouped by movie (most cinemas and
 * showtimes first), as the same grid of poster cards "Qué Hacer" shows. Each
 * movie expands into its per-cinema showtimes with booking links; the map of
 * those cinemas lives on the movie's own page, too wide for a grid column.
 * Date via ?fecha=YYYY-MM-DD. With `cinema` set, only that cinema's showings
 * are listed (branch page).
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
  const [dates, catalog] = await Promise.all([
    getAvailableDates(siteIds),
    // Agent-maintained movie catalog: the detail page, the stable trailer pick
    // and the IMDb / Rotten Tomatoes scores all live in the CMS.
    getMovieCatalog(citySlug),
  ]);
  const date =
    selectedDate && dates.includes(selectedDate)
      ? selectedDate
      : (dates[0] ?? today);
  let billboard = await getMovieBillboard(citySlug, date, { catalog });

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

  const cards = toMovieCards(citySlug, billboard, catalog);

  return (
    <PendingArea className="mt-10" label="Actualizando cartelera…">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">Cartelera</h2>
        <p className="text-sm text-neutral-500">
          Horarios y reservas vía{" "}
          <a
            href="https://rd.caribbeancinemas.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-600 hover:underline"
          >
            Caribbean Cinemas
          </a>
        </p>
      </div>

      <DateTabs
        dates={dates}
        selected={date}
        today={today}
        basePath={basePath}
      />

      {cards.length === 0 ? (
        <p className="mt-6 text-neutral-500">
          No pudimos cargar la cartelera en este momento. Inténtalo más tarde o
          visita{" "}
          <a
            href="https://rd.caribbeancinemas.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:underline"
          >
            caribbeancinemas.com
          </a>
          .
        </p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <MovieCard key={card.name} movie={card} compact showMap={false} />
          ))}
        </div>
      )}
    </PendingArea>
  );
}
