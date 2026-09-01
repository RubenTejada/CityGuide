"use client";

import { Children, useRef, useState, type ReactNode } from "react";

const PAGE_SIZE = 12;

/**
 * Client-side pagination for a server-rendered list: every card is rendered on
 * the server (so the full listing stays in the HTML for crawlers and the
 * facility filter can still see every entry) and only the current page is
 * shown. Remount it — a `key` tied to the filter state — to reset to page 1
 * when the underlying list changes.
 */
export default function PaginatedList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const items = Children.toArray(children);
  const [page, setPage] = useState(1);
  const top = useRef<HTMLDivElement>(null);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const goTo = (next: number) => {
    setPage(next);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={top} className="scroll-mt-24">
      <div className={className}>{visible}</div>
      {pageCount > 1 && (
        <nav
          aria-label="Paginación"
          className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
        >
          <PageButton
            disabled={current === 1}
            onClick={() => goTo(current - 1)}
            label="Página anterior"
          >
            Anterior
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
                label={`Página ${entry}`}
              >
                {entry}
              </PageButton>
            ),
          )}
          <PageButton
            disabled={current === pageCount}
            onClick={() => goTo(current + 1)}
            label="Página siguiente"
          >
            Siguiente
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
