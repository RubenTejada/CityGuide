// The CMS half of the cartelera: the `movie` catalog a city holds, and the cards
// today's billboard turns into. Server-only — it reads the Delivery API, and the
// cards themselves are rendered by client components that must not carry it.

import {
  CINEMAS_BY_CITY,
  getMovieBillboard,
  movieReviews,
  resolveTrailers,
  toMovieCards,
  type CatalogMovie,
  type MovieCardProps,
} from "@/lib/cinema";
import { getDescendantsOfType } from "@/lib/cms";
import { type Locale } from "@/lib/i18n";
import { localizedSectionPath } from "@/lib/sectionSlugs";
import { text } from "@/lib/umbraco";

/**
 * The CMS `movie` catalog of a city, keyed by lowercased movie name. The
 * Caribbean API names the cartelera rows exactly as the agent named the nodes,
 * so the name is the join key between the live billboard and the catalog.
 */
export async function getMovieCatalog(
  citySlug: string,
  locale: Locale,
): Promise<Record<string, CatalogMovie>> {
  const movies = await getDescendantsOfType(
    localizedSectionPath(locale, citySlug, "cines"),
    "movie",
  );
  const catalog: Record<string, CatalogMovie> = {};
  for (const movie of movies) {
    catalog[movie.name.toLowerCase()] = {
      path: movie.route.path,
      trailerYoutubeId: text(movie, "trailerYoutubeId") || null,
      reviews: movieReviews(movie),
    };
  }
  return catalog;
}

/**
 * The richest movies of a city on a date, ready to render, and how many the
 * billboard holds that day. The whole billboard is read to count it; only the
 * movies shown go through the trailer lookup, which is the slow part.
 */
export async function getTopMovies(
  citySlug: string,
  date: string,
  limit: number,
  locale: Locale,
): Promise<{ movies: MovieCardProps[]; total: number }> {
  if (!CINEMAS_BY_CITY[citySlug]) return { movies: [], total: 0 };
  const catalog = await getMovieCatalog(citySlug, locale);
  const billboard = await getMovieBillboard(citySlug, date, {
    catalog,
    trailers: false,
  });
  const top = billboard.slice(0, limit);
  await resolveTrailers(top, catalog);
  return {
    movies: toMovieCards(citySlug, top, locale, catalog),
    total: billboard.length,
  };
}
