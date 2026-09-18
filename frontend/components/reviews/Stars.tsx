import { MAX_RATING } from "@/lib/reviews";

/** Cinco estrellas con las primeras `value` llenas: la valoración de una opinión, dibujada. */
export default function Stars({
  value,
  label,
  className = "",
}: {
  value: number;
  /** Lo que lee un lector de pantalla ("4 estrellas"). */
  label: string;
  className?: string;
}) {
  return (
    <span role="img" aria-label={label} className={`inline-flex text-brand-600 ${className}`}>
      {Array.from({ length: MAX_RATING }, (_, i) => (
        <span key={i} aria-hidden className={i < Math.round(value) ? "" : "text-neutral-300"}>
          ★
        </span>
      ))}
    </span>
  );
}
