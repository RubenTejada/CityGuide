"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { fold, type SearchEntry } from "@/lib/search";

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
export default function SearchAutocomplete({ citySlug }: { citySlug: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<IndexedEntry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const fetchStarted = useRef(false);

  function loadIndex() {
    if (fetchStarted.current) return;
    fetchStarted.current = true;
    fetch(`/api/search-index/${citySlug}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((entries: SearchEntry[]) =>
        setIndex(
          entries.map((e) => ({
            ...e,
            folded: fold(`${e.name} ${e.category} ${e.extra}`),
          })),
        ),
      )
      .catch(() => setIndex([]));
  }

  const suggestions = useMemo(() => {
    const needle = fold(q.trim());
    if (!needle || !index) return [];
    const tokens = needle.split(/\s+/);
    return index
      .filter((e) => tokens.every((t) => e.folded.includes(t)))
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

  const showList = open && suggestions.length > 0;

  return (
    <form
      action={`/${citySlug}/buscar`}
      className="order-last relative flex w-full min-w-0 flex-1 sm:order-none sm:w-auto"
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
        placeholder="Busca por nombre, sector, calle o categoría"
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
        Buscar
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
        </ul>
      )}
    </form>
  );
}
