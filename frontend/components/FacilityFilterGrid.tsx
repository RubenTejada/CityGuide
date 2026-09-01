"use client";

import { useMemo, useState } from "react";
import { type UmbracoItem } from "@/lib/umbraco";
import { FACILITY_ICONS } from "./FacilityBadges";
import PlaceCard from "./PlaceCard";

/**
 * Listing grid with a "Facilidades" multi-select dropdown, rendered in one row
 * with the subcategory pills passed as `children` (dropdown to their right).
 * An entry matches when it has every selected facility. `facilitiesByEntry` is
 * precomputed on the server so companies/malls can match through their
 * branches' facilities.
 */
export default function FacilityFilterGrid({
  entries,
  facilitiesByEntry,
  children,
}: {
  entries: UmbracoItem[];
  facilitiesByEntry: Record<string, string[]>;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  // Canonical facility order first, then any value outside the known list.
  const options = useMemo(() => {
    const present = new Set(Object.values(facilitiesByEntry).flat());
    const known = Object.keys(FACILITY_ICONS).filter((f) => present.has(f));
    const extra = [...present].filter((f) => !(f in FACILITY_ICONS)).sort((a, b) =>
      a.localeCompare(b, "es"),
    );
    return [...known, ...extra];
  }, [facilitiesByEntry]);

  const filtered = selected.length
    ? entries.filter((entry) => {
        const has = facilitiesByEntry[entry.id] ?? [];
        return selected.every((f) => has.includes(f));
      })
    : entries;

  const toggle = (facility: string) =>
    setSelected((current) =>
      current.includes(facility)
        ? current.filter((f) => f !== facility)
        : [...current, facility],
    );

  return (
    <div>
      {(children || options.length > 0) && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {children}
          {options.length > 0 && (
          <div className="relative ml-2">
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
              Filtrar por facilidades
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
                <div className="absolute left-0 z-20 mt-2 w-64 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
                  {options.map((facility) => (
                    <label
                      key={facility}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(facility)}
                        onChange={() => toggle(facility)}
                        className="h-4 w-4 accent-brand-600"
                      />
                      <span aria-hidden>{FACILITY_ICONS[facility] ?? "•"}</span>
                      {facility}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          )}

          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-sm text-neutral-500 underline-offset-2 hover:text-brand-700 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {filtered.map((entry) => (
          <PlaceCard key={entry.id} place={entry} />
        ))}
        {filtered.length === 0 && (
          <p className="text-neutral-500">
            {entries.length === 0
              ? "No hay lugares publicados todavía."
              : "No hay lugares con las facilidades seleccionadas."}
          </p>
        )}
      </div>
    </div>
  );
}
