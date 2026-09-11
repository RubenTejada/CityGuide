// Search helpers shared by the /buscar page and the autocomplete index API.

import { keywordsFor } from "./searchKeywords";

/** Lowercase and strip accents so "cafe" matches "Café". */
export function fold(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** One autocomplete suggestion. Kept flat and small: the whole city index ships to the client. */
export interface SearchEntry {
  name: string;
  /** Route path to navigate to. */
  path: string;
  /** Content kind label shown in the suggestion, already in Spanish. */
  kind: string;
  /** Top-level section (category) the entry lives under, "" for sections themselves. */
  category: string;
  /** Secondary line: address or venue. Also matched against. */
  extra: string;
}

/**
 * Everything an entry is matched against, already folded: what the entry says
 * about itself, plus the words its kind of business is looked for by
 * (`keywordsFor`) — nobody types "Banreservas — ATM" when they want a cajero.
 */
export function searchText(entry: SearchEntry): string {
  return fold(
    `${entry.name} ${entry.category} ${entry.extra} ${keywordsFor(entry.path)}`,
  );
}

/** A query as the words it has to match, in any order. Empty for a blank query. */
export function searchTokens(query: string): string[] {
  const needle = fold(query.trim());
  return needle ? needle.split(/\s+/) : [];
}

/**
 * The one matcher the autocomplete and the results page share. Every word has
 * to appear somewhere, in any order, so "pizza naco" finds the pizzeria in
 * Naco — and finds it on both sides, which is what the two used to disagree on.
 */
export function matchesTokens(text: string, tokens: string[]): boolean {
  return tokens.every((token) => text.includes(token));
}
