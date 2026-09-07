"use client";

import { Children, useRef, type ReactNode } from "react";
import { useWords } from "@/components/LocaleProvider";
import { useUrlQuery } from "./urlQuery";

const PAGE_SIZE = 12;

/**
 * Client-side pagination for a server-rendered list: every card is rendered on
 * the server (so the full listing stays in the HTML for crawlers and the
 * facility filter can still see every entry) and only the current page is
 * shown. The page number lives in the query string, so page 3 of a listing is
 * a link that works; whoever narrows the list clears the parameter to restart
 * at page 1. `param` names it, for a page that ever holds two such lists.
 */
export default function PaginatedList({
  children,
  className,
  param = "pagina",
}: {
  children: ReactNode;
  className?: string;
  param?: string;
}) {
  const words = useWords();
  const { params, set } = useUrlQuery();
  const items = Children.toArray(children);
  const page = Number(params.get(param)) || 1;
  const top = useRef<HTMLDivElement>(null);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const goTo = (next: number) => {
    // Page 1 is the bare URL: it is what every link into the listing points at.
    set((query) => {
      if (next <= 1) query.delete(param);
      else query.set(param, String(next));
    });
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={top} className="scroll-mt-24">
      <div className={className}>{visible}</div>
      {pageCount > 1 && (
        <nav
          aria-label={words.listing.pagination}
          className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
        >
          <PageButton
            disabled={current === 1}
            onClick={() => goTo(current - 1)}
            label={words.listing.previousPage}
          >
            {words.listing.previous}
          </PageButton>
          {pageNumbers(current, pageCount).map((entry, index) =>
            entry === null ? (
              <span key={`gap-${index}`} className="px-1 text-neutral-400">
                …
              </span>
            ) : (
              <PageButton
                key={entry}
                active={entry === current}
                onClick={() => goTo(entry)}
                label={words.listing.page(entry)}
              >
                {entry}
              </PageButton>
            ),
          )}
          <PageButton
            disabled={current === pageCount}
            onClick={() => goTo(current + 1)}
            label={words.listing.nextPage}
          >
            {words.listing.next}
          </PageButton>
        </nav>
      )}
    </div>
  );
}

function PageButton({
  children,
  onClick,
  label,
  active = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`min-w-9 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-neutral-300 bg-white text-neutral-700 hover:border-brand-600 hover:text-brand-700"
      } disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-white disabled:text-neutral-300 disabled:hover:text-neutral-300`}
    >
      {children}
    </button>
  );
}

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
