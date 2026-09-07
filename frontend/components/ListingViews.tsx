"use client";

import { type ReactNode } from "react";
import { useWords } from "@/components/LocaleProvider";
import { useUrlQuery } from "./urlQuery";
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
 * a single row. Filters narrow both views at once.
 * `gridClassName` is the grid the cards sit in: two wide columns by default,
 * overridden by listings whose cards are the narrower "Qué Hacer" ones.
 * `emptyLabel` is what an empty listing says; a listing that is not of places
 * (a company's branches) overrides it.
 *
 * What the visitor picked lives in the query string (one parameter per filter
 * group plus `vista`), so a narrowed listing is a link someone can share and
 * Back walks the picks instead of leaving the site. The values are the CMS
 * names the dropdowns list, which is why such a link does not carry across
 * languages — neither does the path it hangs from.
 */
export default function ListingViews({
  entries,
  filters = [],
  emptyLabel,
  gridClassName = "mt-8 grid gap-4 md:grid-cols-2",
}: {
  entries: ListingEntry[];
  filters?: FilterGroup[];
  emptyLabel?: string;
  gridClassName?: string;
}) {
  const words = useWords();
  const { params, set } = useUrlQuery();
  const view: ListingView = params.get("vista") === "mapa" ? "mapa" : "lista";

  const groups = filters.filter((group) => group.options.length > 0);
  const selected = Object.fromEntries(
    groups.map((group) => [
      group.key,
      params.getAll(group.key).filter((value) => group.options.includes(value)),
    ]),
  );
  const active = groups.filter((group) => selected[group.key]!.length > 0);

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

  // Narrowing the list restarts it at page 1: the page lives in the URL too.
  const toggle = (key: string, value: string) =>
    set((next) => {
      const picks = selected[key] ?? [];
      next.delete(key);
      for (const pick of picks.includes(value)
        ? picks.filter((v) => v !== value)
        : [...picks, value]) {
        next.append(key, pick);
      }
      next.delete("pagina");
    });

  const clear = () =>
    set((next) => {
      for (const group of groups) next.delete(group.key);
      next.delete("pagina");
    });

  const setView = (value: ListingView) =>
    set((next) => {
      if (value === "mapa") next.set("vista", "mapa");
      else next.delete("vista");
    });

  return (
    <div>
      {(groups.length > 0 || mappable) && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
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
              onClick={clear}
              className="text-sm text-neutral-500 underline-offset-2 hover:text-brand-700 hover:underline"
            >
              {words.listing.clearFilters}
            </button>
          )}

          {mappable && <ViewToggle value={view} onChange={setView} />}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="mt-8 text-neutral-500">
          {entries.length === 0
            ? (emptyLabel ?? words.listing.empty)
            : words.listing.noMatches}
        </p>
      ) : view === "mapa" ? (
        <div className="mt-8">
          {markers.length === 0 ? (
            <p className="text-neutral-500">{words.listing.noneOnMap}</p>
          ) : (
            <MarkersMap
              markers={markers}
              locate
              heightClass="h-[26rem] lg:h-[34rem]"
            />
          )}
        </div>
      ) : (
        <PaginatedList className={gridClassName}>
          {filtered.map((entry) => entry.card)}
        </PaginatedList>
      )}
    </div>
  );
}
