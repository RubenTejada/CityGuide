"use client";

import { useState } from "react";

/**
 * Multi-select dropdown used by the listing filters and by the
 * "¿Qué está cerca?" panel. Selection is owned by the caller: `selected`
 * carries the current picks and `onToggle` adds or removes one.
 */
export default function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  icons,
  className = "relative ml-2",
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  icons?: Record<string, string>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
          selected.length > 0
            ? "border-brand-600 bg-brand-50 text-brand-700"
            : "border-neutral-300 bg-white text-neutral-700 hover:border-brand-600 hover:text-brand-700"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
            {selected.length}
          </span>
        )}
        <span aria-hidden className="text-xs">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar filtro"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute left-0 z-20 mt-2 max-h-80 w-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
            {options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => onToggle(option)}
                  className="h-4 w-4 accent-brand-600"
                />
                {icons && <span aria-hidden>{icons[option] ?? "•"}</span>}
                {option}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
