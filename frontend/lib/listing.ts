/** How many cards one page of a listing shows. */
export const LISTING_PAGE_SIZE = 12;

/** The query parameter carrying the page number, in either language. */
export const PAGE_PARAM = "pagina";

/** A page's query string as the router hands it over. */
export type ListingQuery = { [key: string]: string | string[] | undefined };

/** What the browser needs to draw one dropdown — never the values themselves. */
export type FilterControl = {
  key: string;
  label: string;
  options: string[];
  icons?: Record<string, string>;
};

/**
 * One dropdown's worth of filtering as the server holds it: `valuesByEntry`
 * says what each entry matches (precomputed, so companies and malls can match
 * through their branches) and `match` is how several picks inside the same
 * dropdown combine — "all" for facilities (a place must have every one), "any"
 * for a taxonomy like the cuisine (italiana *or* china). Different dropdowns
 * always combine with "and".
 *
 * Which entries a listing shows is decided here, on the server, and only the
 * twelve cards of the current page are ever rendered. Doing it in the browser
 * meant serialising every card of every entry into the page to show twelve of
 * them — on "Restaurantes" in Santo Domingo, 3.8 MB to draw 12 places.
 */
export type FilterGroup = FilterControl & {
  valuesByEntry: Record<string, string[]>;
  match: "all" | "any";
};

/**
 * A route path with no trailing slash, so a query string can follow it. The
 * Delivery API hands them over both ways, and `/restaurantes/?pagina=3` is a
 * second URL for a page that already has one.
 */
function base(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

/** That path carrying a page number — page 1 being the bare URL. */
export function withPage(path: string, page: number): string {
  return page > 1 ? `${base(path)}?${PAGE_PARAM}=${page}` : base(path);
}

/** The values of one query parameter, however many times it is repeated. */
function values(query: ListingQuery, key: string): string[] {
  const raw = query[key];
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * What each dropdown has ticked. A value the dropdown does not offer is
 * dropped, so a hand-written or stale URL narrows a listing to nothing only
 * when it really asks for something the listing has.
 */
export function selectedFilters(
  groups: FilterGroup[],
  query: ListingQuery,
): Record<string, string[]> {
  return Object.fromEntries(
    groups.map((group) => [
      group.key,
      values(query, group.key).filter((value) => group.options.includes(value)),
    ]),
  );
}

/** The entries every ticked dropdown agrees on. */
export function filterEntries<T extends { id: string }>(
  entries: T[],
  groups: FilterGroup[],
  selected: Record<string, string[]>,
): T[] {
  const active = groups.filter((group) => selected[group.key]?.length);
  if (active.length === 0) return entries;
  return entries.filter((entry) =>
    active.every((group) => {
      const has = group.valuesByEntry[entry.id] ?? [];
      const picks = selected[group.key]!;
      return group.match === "all"
        ? picks.every((value) => has.includes(value))
        : picks.some((value) => has.includes(value));
    }),
  );
}

/** The page the query asks for, clamped to what the listing holds. */
export function listingPage(
  count: number,
  query: ListingQuery,
): { page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(count / LISTING_PAGE_SIZE));
  const asked = Number(values(query, PAGE_PARAM)[0]) || 1;
  return { page: Math.min(Math.max(1, asked), pageCount), pageCount };
}

/** The slice of a listing that page holds. */
export function pageEntries<T>(entries: T[], page: number): T[] {
  const from = (page - 1) * LISTING_PAGE_SIZE;
  return entries.slice(from, from + LISTING_PAGE_SIZE);
}

/**
 * The URL of one page of this listing: the query the visitor is already on,
 * with the page number set — or dropped, because page 1 is the bare URL every
 * link into the listing points at.
 */
export function pageHref(
  basePath: string,
  query: ListingQuery,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(query)) {
    if (key === PAGE_PARAM) continue;
    for (const value of values(query, key)) params.append(key, value);
  }
  if (page > 1) params.set(PAGE_PARAM, String(page));
  const search = params.toString();
  return search ? `${base(basePath)}?${search}` : base(basePath);
}

/**
 * The canonical URL of a listing page.
 *
 * A page of a listing is its own page and says so: `?pagina=3` self-references,
 * or a search engine crawls it, folds it into page 1 and eventually stops
 * coming back — which is what leaves everything past the first twelve entries
 * out of the index. Out of range it points at the bare URL instead, so a
 * `?pagina=999` somebody linked is not an indexable page of its own.
 *
 * Everything else the query string can carry — a ticked filter, the map view,
 * the day of a cartelera — folds into the bare URL. Those are the same page
 * seen differently, and a crawlable URL per combination of them is a thousand
 * near-identical pages competing with the one that matters.
 */
export function canonicalListingPath(
  basePath: string,
  query: ListingQuery,
  pageCount: number,
): string {
  const others = Object.keys(query).filter(
    (key) => key !== PAGE_PARAM && values(query, key).length > 0,
  );
  if (others.length > 0) return base(basePath);
  const asked = Number(values(query, PAGE_PARAM)[0]) || 1;
  return withPage(basePath, asked <= pageCount ? asked : 1);
}
