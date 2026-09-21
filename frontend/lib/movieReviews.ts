// A movie's IMDb and Rotten Tomatoes scores, as the agent's cinema sync stores
// them on the CMS `movie` node, and where each one links out to.
//
// Kept apart from lib/cinema.ts because the badges that render them are part
// of a Client Component (MovieCard), and lib/cinema.ts reads the Caribbean
// Cinemas API through `use cache`, which only exists on the server: importing
// a value from it would pull the fetch layer into the browser bundle.

import { text, type UmbracoItem } from "@/lib/umbraco";

/** IMDb and Rotten Tomatoes scores, filled by the agent's cinema sync. */
export interface MovieReviews {
  imdbId: string | null;
  /** "7.8" on IMDb's ten-point scale. */
  imdbRating: string | null;
  imdbVotes: number | null;
  /** Tomatometer, 0–100. */
  rottenTomatoes: number | null;
  /** Original (usually English) title — what both services index by. */
  originalTitle: string | null;
}

/** Reviews stored on a CMS `movie` node, or null when it has no score at all. */
export function movieReviews(item: UmbracoItem): MovieReviews | null {
  const votes = Number(text(item, "imdbVotes"));
  const tomatometer = Number(text(item, "rottenTomatoes"));
  const reviews: MovieReviews = {
    imdbId: text(item, "imdbId") || null,
    imdbRating: text(item, "imdbRating") || null,
    imdbVotes: Number.isFinite(votes) && votes > 0 ? votes : null,
    rottenTomatoes:
      Number.isFinite(tomatometer) && tomatometer > 0 ? tomatometer : null,
    originalTitle: text(item, "originalTitle") || null,
  };
  return reviews.imdbId || reviews.rottenTomatoes ? reviews : null;
}

/** Where a movie's scores are read and discussed in full. */
export function imdbUrl(reviews: MovieReviews): string | null {
  return reviews.imdbId
    ? `https://www.imdb.com/title/${reviews.imdbId}/`
    : null;
}

/**
 * Rotten Tomatoes exposes no id in the data we get, so the link is its search
 * for the original title — always resolvable, never a guessed 404.
 */
export function rottenTomatoesUrl(name: string, reviews: MovieReviews): string {
  return `https://www.rottentomatoes.com/search?search=${encodeURIComponent(
    reviews.originalTitle ?? name,
  )}`;
}
