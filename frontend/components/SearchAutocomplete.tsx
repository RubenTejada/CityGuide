"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { type Locale, localeHref, t } from "@/lib/i18n";
import {
  matchesTokens,
  searchText,
  searchTokens,
  type SearchEntry,
} from "@/lib/search";

const MAX_SUGGESTIONS = 8;

interface IndexedEntry extends SearchEntry {
  folded: string;
}

/**
 * Header search box with autocomplete. The whole city index is fetched once
 * (on first focus) from /api/search-index/[city] and filtered in memory, so
 * typing never waits on the network. Without JS it degrades to the plain
 * GET form against /[city]/buscar.
 */
export default function SearchAutocomplete({
  citySlug,
  locale,
  className,
}: {
  citySlug: string;
  locale: Locale;
  className?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<IndexedEntry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const fetchStarted = useRef(false);

  function loadIndex() {
    if (fetchStarted.current) return;
    fetchStarted.current = true;
    fetch(`/api/search-index/${citySlug}?lang=${locale}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((entries: SearchEntry[]) =>
        setIndex(
          entries.map((e) => ({
            ...e,
            folded: searchText(e),
          })),
        ),
      )
      .catch(() => setIndex([]));
  }

  const suggestions = useMemo(() => {
    const tokens = searchTokens(q);
    if (tokens.length === 0 || !index) return [];
    return index
      .filter((e) => matchesTokens(e.folded, tokens))
      .slice(0, MAX_SUGGESTIONS);
  }, [q, index]);

  function go(entry: IndexedEntry) {
    setOpen(false);
    setQ("");
    router.push(entry.path);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && active >= 0 && suggestions[active]) {
      e.preventDefault();
      go(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Open on any query, not only on a hit: a dropdown that disappears when
  // nothing matches reads as a broken search box, and the row that opens the
  // full results is the pointer affordance for what Enter already does.
  const showList = open && q.trim().length > 0 && index !== null;

  return (
    <form
      action={localeHref(locale, `/${citySlug}/buscar`)}
      className={`order-last relative flex w-full min-w-0 sm:order-none sm:w-auto sm:flex-1 ${
        className ?? ""
      }`}
      role="search"
    >
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => {
          loadIndex();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={t(locale).nav.search}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls="search-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={
          active >= 0 ? `search-suggestion-${active}` : undefined
        }
        className="w-full min-w-0 rounded-l-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-sun-400 focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-r-lg bg-sun-400 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-sun-300"
      >
        {t(locale).nav.searchButton}
      </button>

      {showList && (
        <ul
          id="search-suggestions"
          role="listbox"
          // preventDefault keeps the input focused so onBlur doesn't close the
          // list before the click on a suggestion lands.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          {suggestions.length === 0 && (
            <li className="px-4 py-2.5 text-sm text-neutral-500">
              {t(locale).search.noSuggestions}
            </li>
          )}
          {suggestions.map((entry, i) => (
            <li
              key={entry.path}
              id={`search-suggestion-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(entry)}
              className={`cursor-pointer px-4 py-2.5 ${
                i === active ? "bg-neutral-100" : "bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-neutral-900">
                  {entry.name}
                </span>
                <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  {entry.kind}
                </span>
              </div>
              {(entry.category || entry.extra) && (
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {[entry.category, entry.extra].filter(Boolean).join(" · ")}
                </p>
              )}
            </li>
          ))}
          <li className="border-t border-neutral-200">
            <button
              type="submit"
              className="w-full cursor-pointer px-4 py-2.5 text-left text-sm font-medium text-brand-700 hover:bg-neutral-100"
            >
              {t(locale).search.seeAllResults(q.trim())}
            </button>
          </li>
        </ul>
      )}
    </form>
  );
}
