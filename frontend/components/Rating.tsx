import { num, type UmbracoItem } from "@/lib/umbraco";
import { type Locale } from "@/lib/i18n";
import { getSiteRating } from "@/lib/portalApi";
import { RatingPair } from "./RatingBadge";

/**
 * A place's ratings: Google's (stored on the node by the agent) and, beside it, the
 * portal's own visitors' — read from one cached map of every rated place, so a grid
 * of cards costs one request, not one per card. Server-only; client components take
 * the numbers and draw `RatingPair` themselves.
 */
export default async function Rating({
  locale,
  place,
  className = "",
}: {
  locale: Locale;
  place: UmbracoItem;
  className?: string;
}) {
  const site = await getSiteRating(place.id);
  return (
    <RatingPair
      google={num(place, "googleRating")}
      googleCount={num(place, "googleRatingCount")}
      site={site?.average}
      siteCount={site?.count}
      locale={locale}
      className={className}
    />
  );
}
