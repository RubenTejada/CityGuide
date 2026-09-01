import {
  imdbUrl,
  rottenTomatoesUrl,
  type MovieReviews,
} from "@/lib/cinema";

/**
 * IMDb and Rotten Tomatoes scores, each linking out to the movie there.
 * Renders nothing when the CMS catalog has no scores for the movie — the
 * agent fills them, so a brand-new title can be on screen before they exist.
 */
export default function MovieReviewBadges({
  movieName,
  reviews,
  size = "md",
}: {
  movieName: string;
  reviews: MovieReviews | null;
  size?: "sm" | "md";
}) {
  if (!reviews) return null;
  const imdb = imdbUrl(reviews);
  if (!imdb && !reviews.rottenTomatoes) return null;

  const chip = `inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white font-medium hover:border-brand-500 ${
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
  }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {imdb && (
        <a
          href={imdb}
          target="_blank"
          rel="noopener noreferrer"
          title={`${movieName} en IMDb`}
          className={chip}
        >
          <span className="rounded bg-[#f5c518] px-1 text-[10px] font-bold text-black">
            IMDb
          </span>
          {reviews.imdbRating ? (
            <span className="text-neutral-700">
              {reviews.imdbRating}
              <span className="text-neutral-400">/10</span>
              {reviews.imdbVotes && (
                <span className="ml-1 font-normal text-neutral-400">
                  ({compactVotes(reviews.imdbVotes)})
                </span>
              )}
            </span>
          ) : (
            <span className="text-neutral-700">Ver ficha</span>
          )}
        </a>
      )}
      {reviews.rottenTomatoes !== null && (
        <a
          href={rottenTomatoesUrl(movieName, reviews)}
          target="_blank"
          rel="noopener noreferrer"
          title={`${movieName} en Rotten Tomatoes`}
          className={chip}
        >
          <span aria-hidden>{reviews.rottenTomatoes >= 60 ? "🍅" : "🤢"}</span>
          <span className="text-neutral-700">
            {reviews.rottenTomatoes}%
            <span className="ml-1 font-normal text-neutral-400">
              Rotten Tomatoes
            </span>
          </span>
        </a>
      )}
    </div>
  );
}

function compactVotes(votes: number): string {
  return new Intl.NumberFormat("es-DO", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(votes);
}
