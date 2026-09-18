import { INTL_LOCALE, t, type Locale } from "@/lib/i18n";

/** Whose rating it is. Google's and the portal's visitors' are never averaged together. */
export type RatingSource = "google" | "site";

/**
 * One rating (★ 4.5 (1.234) Google) from plain numbers — for cards, detail headers
 * and the map, whatever the data came from. Renders nothing without a value.
 *
 * The source is named beside the number, since a place can carry both and they are
 * two different crowds. `compact` keeps the name for screen readers and the tooltip
 * only, for the one-line rows of a map list; the star's colour still tells them apart.
 */
export function RatingBadge({
  value,
  count,
  locale,
  source = "google",
  compact = false,
  className = "",
}: {
  value: number | null | undefined;
  count?: number | null;
  locale: Locale;
  source?: RatingSource;
  compact?: boolean;
  className?: string;
}) {
  if (!value) return null;
  const words = t(locale);
  const label =
    source === "site" ? words.reviews.siteLabel : words.reviews.googleLabel;
  const long =
    source === "site" ? words.reviews.siteRating : words.place.googleRating;
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm ${className}`}
      title={compact ? long : undefined}
    >
      <span
        aria-hidden
        className={source === "site" ? "text-brand-600" : "text-sun-500"}
      >
        ★
      </span>
      <span className="font-medium text-neutral-800">{value.toFixed(1)}</span>
      {!!count && count > 0 && (
        <span className="text-neutral-500">
          ({count.toLocaleString(INTL_LOCALE[locale])})
        </span>
      )}
      {compact ? (
        <span className="sr-only">{long}</span>
      ) : (
        <span className="text-xs text-neutral-500">
          <span aria-hidden>{label}</span>
          <span className="sr-only">{long}</span>
        </span>
      )}
    </span>
  );
}

/**
 * Google's rating and the portal's side by side, each with its own name — or just
 * the one a place has. Nothing when it has neither.
 */
export function RatingPair({
  google,
  googleCount,
  site,
  siteCount,
  locale,
  compact = false,
  className = "",
  badgeClassName = "",
}: {
  google?: number | null;
  googleCount?: number | null;
  site?: number | null;
  siteCount?: number | null;
  locale: Locale;
  compact?: boolean;
  className?: string;
  badgeClassName?: string;
}) {
  if (!google && !site) return null;
  return (
    <span
      className={`inline-flex flex-wrap items-center ${compact ? "gap-x-2" : "gap-x-3"} gap-y-0.5 ${className}`}
    >
      <RatingBadge
        value={google}
        count={googleCount}
        locale={locale}
        compact={compact}
        className={badgeClassName}
      />
      <RatingBadge
        value={site}
        count={siteCount}
        locale={locale}
        source="site"
        compact={compact}
        className={badgeClassName}
      />
    </span>
  );
}
