"use client";

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Shared pill row used by the events listing and the "Qué Hacer" guide.
 * `null` means "all"; the first pill selects it.
 */
export default function FilterPills({
  options,
  value,
  onChange,
  allLabel,
  className = "mt-6 flex flex-wrap gap-2",
}: {
  options: FilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  allLabel: string;
  className?: string;
}) {
  const pill = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm transition ${
      active
        ? "border-brand-600 bg-brand-600 text-white"
        : "border-neutral-300 bg-white text-neutral-700 hover:border-brand-600 hover:text-brand-700"
    }`;

  return (
    <div className={className}>
      <button type="button" onClick={() => onChange(null)} className={pill(value === null)}>
        {allLabel}
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={pill(value === option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
