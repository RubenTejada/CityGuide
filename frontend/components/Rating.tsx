import { num, type UmbracoItem } from "@/lib/umbraco";

/** Google rating badge (★ 4.5 (1,234)). Renders nothing when the place has no rating. */
export default function Rating({
  place,
  className = "",
}: {
  place: UmbracoItem;
  className?: string;
}) {
  const value = num(place, "googleRating");
  if (!value) return null;
  const count = num(place, "googleRatingCount");
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${className}`}>
      <span aria-hidden className="text-sun-500">
        ★
      </span>
      <span className="font-medium text-neutral-800">{value.toFixed(1)}</span>
      {count > 0 && (
        <span className="text-neutral-500">
          ({count.toLocaleString("es-DO")})
        </span>
      )}
      <span className="sr-only">Calificación de Google</span>
    </span>
  );
}
