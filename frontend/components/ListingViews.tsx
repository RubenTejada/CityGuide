"use client";

import { useState, type ReactNode } from "react";
import MarkersMap, { type MapMarker } from "./MarkersMap";
import PaginatedList from "./PaginatedList";
import ViewToggle, { type ListingView } from "./ViewToggle";

/**
 * One dropdown's worth of filtering. `valuesByEntry` is precomputed on the
 * server (so companies/malls can match through their branches) and `options`
 * carries the order the values are listed in. `match` is how several picks
 * inside the same dropdown combine: "all" for facilities (a place must have
 * every one), "any" for taxonomies like the cuisine type (italiana *or*
 * china). Different dropdowns always combine with "and".
 */
export type FilterGroup = {
  key: string;
  label: string;
  options: string[];
  valuesByEntry: Record<string, string[]>;
  match: "all" | "any";
  icons?: Record<string, string>;
};

/**
 * One listing result: its server-rendered card and the pins it puts on the
 * map. A place or mall contributes one pin, a company one per branch, and an
 * entry with no coordinates contributes none.
 */
export interface ListingEntry {
  id: string;
  card: ReactNode;
  markers: MapMarker[];
}

/**
 * A listing in its two views — the paginated grid of cards and the map of the
 * same results — with one multi-select dropdown per filter group, rendered in
 * a single row with whatever is passed as `children` (the subcategory pills)
 * to their left. Filters narrow both views at once.
 */
export default function ListingViews({
  entries,
  filters = [],
  emptyLabel = "No hay lugares publicados todavía.",
  children,
}: {
  entries: ListingEntry[];
  filters?: FilterGroup[];
  emptyLabel?: string;
  children?: ReactNode;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [view, setView] = useState<ListingView>("lista");

  const groups = filters.filter((group) => group.options.length > 0);
  const active = groups.filter((group) => (selected[group.key] ?? []).length > 0);

  const filtered = active.length
    ? entries.filter((entry) =>
        active.every((group) => {
          const has = group.valuesByEntry[entry.id] ?? [];
          const picks = selected[group.key]!;
          return group.match === "all"
            ? picks.every((value) => has.includes(value))
            : picks.some((value) => has.includes(value));
        }),
      )
    : entries;

  const markers = filtered.flatMap((entry) => entry.markers);
  const mappable = entries.some((entry) => entry.markers.length > 0);

  const toggle = (key: string, value: string) =>
    setSelected((current) => {
      const picks = current[key] ?? [];
      return {
        ...current,
        [key]: picks.includes(value)
          ? picks.filter((v) => v !== value)
          : [...picks, value],
      };
    });

  return (
    <div>
      {(children || groups.length > 0 || mappable) && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {children}
          {groups.map((group) => (
            <FilterDropdown
              key={group.key}
              group={group}
              selected={selected[group.key] ?? []}
              onToggle={(value) => toggle(group.key, value)}
            />
          ))}

          {active.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected({})}
              className="text-sm text-neutral-500 underline-offset-2 hover:text-brand-700 hover:underline"
            >
              Limpiar filtros
            </button>
          )}

          {mappable && <ViewToggle value={view} onChange={setView} />}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="mt-8 text-neutral-500">
          {entries.length === 0
            ? emptyLabel
            : "No hay lugares que coincidan con los filtros seleccionados."}
        </p>
      ) : view === "mapa" ? (
        <div className="mt-8">
          {markers.length === 0 ? (
            <p className="text-neutral-500">
              Ninguno de estos resultados tiene ubicación en el mapa.
            </p>
          ) : (
            <MarkersMap
              markers={markers}
              locate
              heightClass="h-[26rem] lg:h-[34rem]"
            />
          )}
        </div>
      ) : (
        // Remounted on every filter change so the list restarts at page 1.
        <PaginatedList
          key={groups
            .map((group) => (selected[group.key] ?? []).join("|"))
            .join("&&")}
          className="mt-8 grid gap-4 md:grid-cols-2"
        >
          {filtered.map((entry) => entry.card)}
        </PaginatedList>
      )}
    </div>
  );
}

function FilterDropdown({
  group,
  selected,
  onToggle,
}: {
  group: FilterGroup;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
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
        {group.label}
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
            {group.options.map((option) => (
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
                {group.icons && (
                  <span aria-hidden>{group.icons[option] ?? "•"}</span>
                )}
                {option}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
