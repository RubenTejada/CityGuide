// Search helpers shared by the /buscar page and the autocomplete index API.

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
