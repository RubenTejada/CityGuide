"use client";

import { type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useWords } from "@/components/LocaleProvider";
import { PendingArea, usePendingNavigate } from "@/components/LoadingOverlay";
import { PAGE_PARAM, type FilterControl } from "@/lib/listing";
import FilterDropdown from "./FilterDropdown";
import MarkersMap, { type MapMarker } from "./MarkersMap";
import ViewToggle, { type ListingView } from "./ViewToggle";

/**
 * A listing in its two views — the paginated grid of cards and the map of the
 * same results — with one multi-select dropdown per filter group, rendered in
 * a single row. Filters narrow both views at once.
 *
 * What the visitor picked lives in the query string (one parameter per filter
 * group, plus `vista` and the page), so a narrowed listing is a link someone
 * can share and Back walks the picks instead of leaving the site. The values
 * are the CMS names the dropdowns list, which is why such a link does not
 * carry across languages — neither does the path it hangs from.
 *
 * The server owns that state: it filters, it slices, and it renders the twelve
 * cards of the page being read, which arrive here already drawn. So a click
 * navigates rather than mutating state in place — covered by the overlay of
 * the `PendingArea` around the whole block — instead of the page carrying a
 * rendered card for every entry so the browser could pick twelve. The filter
 * controls stay buttons, not links: a crawlable URL per combination of
 * facilities is a thousand near-identical pages, which is the opposite of what
 * the pagination links are for.
 *
 * `gridClassName` is the grid the cards sit in: two wide columns by default,
 * overridden by listings whose cards are the narrower "Qué Hacer" ones.
 * `emptyLabel` is what an empty listing says; a listing that is not of places
 * (a company's branches) overrides it.
 */
export default function ListingViews(props: ListingProps) {
  return (
    <PendingArea>
      <ListingBody {...props} />
    </PendingArea>
  );
}

interface ListingProps {
  /** The cards of the page being read, rendered on the server. */
  cards: ReactNode;
  /** Its page links, also server-rendered; absent when there is one page. */
  pagination?: ReactNode;
  /** Pins for every entry the filters kept, however many pages they span. */
  markers: MapMarker[];
  /** Whether any entry at all has coordinates, which is what offers the map. */
  hasMap: boolean;
  filters?: FilterControl[];
  selected?: Record<string, string[]>;
  view: ListingView;
  /** Entries after filtering, and before it — an empty listing and a listing
   * narrowed to nothing say different things. */
  total: number;
  overall: number;
  emptyLabel?: string;
  /** What a listing narrowed to nothing says; the default speaks of places. */
  noMatchesLabel?: string;
  gridClassName?: string;
}

function ListingBody({
  cards,
  pagination,
  markers,
  hasMap,
  filters = [],
  selected = {},
  view,
  total,
  overall,
  emptyLabel,
  noMatchesLabel,
  gridClassName = "mt-8 grid gap-4 md:grid-cols-2",
}: ListingProps) {
  const words = useWords();
  const navigate = usePendingNavigate();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (update: (query: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    update(next);
    // Whatever changes, the listing restarts at page 1: the page it was on
    // holds different entries now, or none.
    next.delete(PAGE_PARAM);
    const query = next.toString();
    navigate(query ? `${pathname}?${query}` : pathname);
  };

  const active = filters.filter((group) => selected[group.key]?.length);

  const toggle = (key: string, value: string) =>
    go((next) => {
      const picks = selected[key] ?? [];
      next.delete(key);
      for (const pick of picks.includes(value)
        ? picks.filter((v) => v !== value)
        : [...picks, value]) {
        next.append(key, pick);
      }
    });

  const clear = () =>
    go((next) => {
      for (const group of filters) next.delete(group.key);
    });

  const setView = (value: ListingView) =>
    go((next) => {
      if (value === "mapa") next.set("vista", "mapa");
      else next.delete("vista");
    });

  return (
    <div>
      {(filters.length > 0 || hasMap) && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {filters.map((group) => (
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

          {hasMap && <ViewToggle value={view} onChange={setView} />}
        </div>
      )}

      {total === 0 ? (
        <p className="mt-8 text-neutral-500">
          {overall === 0
            ? (emptyLabel ?? words.listing.empty)
            : (noMatchesLabel ?? words.listing.noMatches)}
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
        <>
          <div className={gridClassName}>{cards}</div>
          {pagination}
        </>
      )}
    </div>
  );
}
