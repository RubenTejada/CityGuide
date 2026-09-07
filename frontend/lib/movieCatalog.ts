// The CMS half of the cartelera: the `movie` catalog a city holds, and the cards
// today's billboard turns into. Server-only — it reads the Delivery API, and the
// cards themselves are rendered by client components that must not carry it.

import {
  CINEMAS_BY_CITY,
  getMovieBillboard,
  movieReviews,
  toMovieCards,
  todayInDR,
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

/** Today's richest movies in a city, ready to render. */
export async function getTopMoviesToday(
  citySlug: string,
  limit: number,
  locale: Locale,
): Promise<MovieCardProps[]> {
  if (!CINEMAS_BY_CITY[citySlug]) return [];
  const catalog = await getMovieCatalog(citySlug, locale);
  const billboard = await getMovieBillboard(citySlug, todayInDR(), {
    catalog,
    limit,
  });
  return toMovieCards(citySlug, billboard, locale, catalog);
}
