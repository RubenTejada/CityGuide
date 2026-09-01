"use client";

export type ListingView = "lista" | "mapa";

/**
 * Segmented switch between the paginated list and the map of the very same
 * results. Shown only where the results actually have coordinates.
 */
export default function ViewToggle({
  value,
  onChange,
}: {
  value: ListingView;
  onChange: (view: ListingView) => void;
}) {
  const button = (view: ListingView, label: string) => (
    <button
      type="button"
      onClick={() => onChange(view)}
      aria-pressed={value === view}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        value === view
          ? "bg-brand-600 text-white"
          : "text-neutral-700 hover:text-brand-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="ml-auto inline-flex rounded-full border border-neutral-300 bg-white p-0.5">
      {button("lista", "Lista")}
      {button("mapa", "Mapa")}
    </div>
  );
}
