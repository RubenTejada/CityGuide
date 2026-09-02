"use client";

import { useState } from "react";

/**
 * Multi-select dropdown used by the listing filters and by the
 * "¿Qué está cerca?" panel. Selection is owned by the caller: `selected`
 * carries the current picks and `onToggle` adds or removes one.
 * The trigger wears the deep logo blue in both themes — dark mode leaves
 * `bg-brand-700` alone, so the filters read as the same control there — in
 * white (5.9:1; the lighter `brand-500` only reaches 2.9:1, which is why the
 * tone goes down rather than the text back to black), and the number of picks
 * rides in a white counter instead of a second colour.
 * Every option shows a glyph on an azure disc: callers pass one per option and
 * their icon maps have no gaps, so the disc is never empty.
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
        className="inline-flex items-center gap-2 rounded-full border border-brand-800 bg-brand-700 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-800"
      >
        {label}
        {selected.length > 0 && (
          <span className="on-brand rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-brand-700">
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
                <span
                  aria-hidden
                  className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-sm"
                >
                  {icons?.[option] ?? "•"}
                </span>
                {option}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
