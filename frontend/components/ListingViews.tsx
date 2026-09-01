"use client";

import { useState, type ReactNode } from "react";
import FilterDropdown from "./FilterDropdown";
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
              label={group.label}
              options={group.options}
              icons={group.icons}
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
