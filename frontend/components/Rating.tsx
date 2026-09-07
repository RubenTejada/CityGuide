import { num, type UmbracoItem } from "@/lib/umbraco";
import { t, type Locale } from "@/lib/i18n";

/** Google rating badge (★ 4.5 (1,234)). Renders nothing when the place has no rating. */
export default function Rating({
  locale,
  place,
  className = "",
}: {
  locale: Locale;
  place: UmbracoItem;
  className?: string;
}) {
  return (
    <RatingBadge
      value={num(place, "googleRating")}
      count={num(place, "googleRatingCount")}
      locale={locale}
      className={className}
    />
  );
}

/** Same badge from plain numbers — for map popups and other non-Umbraco data. */
export function RatingBadge({
  value,
  count,
  locale,
  className = "",
}: {
  value: number | null | undefined;
  count?: number | null;
  locale: Locale;
  className?: string;
}) {
  if (!value) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${className}`}>
      <span aria-hidden className="text-sun-500">
        ★
      </span>
      <span className="font-medium text-neutral-800">{value.toFixed(1)}</span>
      {!!count && count > 0 && (
        <span className="text-neutral-500">
          ({count.toLocaleString("es-DO")})
        </span>
      )}
      <span className="sr-only">{t(locale).place.googleRating}</span>
    </span>
  );
}
