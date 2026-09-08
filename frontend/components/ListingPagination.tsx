import { PendingLink } from "@/components/LoadingOverlay";
import { t as dictionary, type Locale } from "@/lib/i18n";
import { pageHref, type ListingQuery } from "@/lib/listing";

/**
 * The pages of a listing, as links.
 *
 * Every page is a real `<a href>` and a real server render: the listing beyond
 * the first twelve entries would otherwise be client state, which a crawler
 * cannot reach and a visitor cannot bookmark. Page 1 is the bare URL, so the
 * canonical one carries no query string, and the links keep whatever else the
 * visitor picked — the ticked filters, the day of a cartelera.
 */
export default function ListingPagination({
  locale,
  basePath,
  query,
  page,
  pageCount,
}: {
  locale: Locale;
  basePath: string;
  query: ListingQuery;
  page: number;
  pageCount: number;
}) {
  const words = dictionary(locale).listing;
  if (pageCount < 2) return null;

  const step = (to: number, label: string, text: string) =>
    to < 1 || to > pageCount ? (
      // The edges of the range lead nowhere: a link there would be a second
      // URL for the page the visitor is already on.
      <span
        aria-disabled="true"
        aria-label={label}
        className={`${LINK_CLASS} cursor-not-allowed border-neutral-200 bg-white text-neutral-300`}
      >
        {text}
      </span>
    ) : (
      <PendingLink
        href={pageHref(basePath, query, to)}
        aria-label={label}
        className={`${LINK_CLASS} ${IDLE_CLASS}`}
      >
        {text}
      </PendingLink>
    );

  return (
    <nav
      aria-label={words.pagination}
      className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
    >
      {step(page - 1, words.previousPage, words.previous)}
      {pageNumbers(page, pageCount).map((entry, index) =>
        entry === null ? (
          <span key={`gap-${index}`} className="px-1 text-neutral-400">
            …
          </span>
        ) : (
          <PendingLink
            key={entry}
            href={pageHref(basePath, query, entry)}
            aria-label={words.page(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={`${LINK_CLASS} ${
              entry === page
                ? "border-brand-600 bg-brand-600 text-white"
                : IDLE_CLASS
            }`}
          >
            {entry}
          </PendingLink>
        ),
      )}
      {step(page + 1, words.nextPage, words.next)}
    </nav>
  );
}

const LINK_CLASS =
  "inline-block min-w-9 rounded-lg border px-3 py-1.5 text-center text-sm font-medium transition";

const IDLE_CLASS =
  "border-neutral-300 bg-white text-neutral-700 hover:border-brand-600 hover:text-brand-700";

/** Page numbers around the current one; `null` marks an elided range. */
function pageNumbers(current: number, pageCount: number): (number | null)[] {
  const shown = new Set([1, pageCount, current, current - 1, current + 1]);
  const pages: (number | null)[] = [];
  for (let page = 1; page <= pageCount; page++) {
    if (shown.has(page)) pages.push(page);
    else if (pages[pages.length - 1] !== null) pages.push(null);
  }
  return pages;
}
