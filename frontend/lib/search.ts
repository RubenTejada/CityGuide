// Search helpers shared by the /buscar page and the autocomplete index API.

import {
  getChildren,
  getDescendantsOfType,
  text,
  type UmbracoItem,
} from "./umbraco";

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

const KIND_LABELS: Record<string, string> = {
  place: "Lugar",
  company: "Empresa",
  eventItem: "Evento",
  categoryPage: "Categoría",
  subcategory: "Subcategoría",
  article: "Artículo",
};

/** Umbraco route paths may carry a trailing slash; strip it for prefix checks. */
function trimPath(path: string): string {
  return path.replace(/\/+$/, "");
}

function toEntry(
  item: UmbracoItem,
  sectionNameByPath: Map<string, string>,
): SearchEntry {
  // Category = the city section whose path prefixes this item's path.
  let category = "";
  for (const [sectionPath, sectionName] of sectionNameByPath) {
    if (trimPath(item.route.path).startsWith(`${sectionPath}/`)) {
      category = sectionName;
      break;
    }
  }
  return {
    name: item.name,
    path: item.route.path,
    kind: KIND_LABELS[item.contentType] ?? item.contentType,
    category,
    extra: text(item, "address") || text(item, "venueName"),
  };
}

/**
 * Precomputed autocomplete index for one city: categories, subcategories,
 * places, companies and events. Built from the (ISR-cached) Delivery API,
 * so repeat requests are served without hitting the CMS.
 */
export async function buildSearchIndex(cityPath: string): Promise<SearchEntry[]> {
  const sections = (await getChildren(cityPath)).filter(
    (s) =>
      s.contentType === "categoryPage" ||
      s.contentType === "eventsPage" ||
      s.contentType === "articlesPage",
  );
  const sectionNameByPath = new Map(
    sections.map((s) => [trimPath(s.route.path), s.name]),
  );

  const [subcategories, companies, places, events, articles] = await Promise.all([
    getDescendantsOfType(cityPath, "subcategory"),
    getDescendantsOfType(cityPath, "company"),
    getDescendantsOfType(cityPath, "place"),
    getDescendantsOfType(cityPath, "eventItem"),
    getDescendantsOfType(cityPath, "article"),
  ]);

  return [
    ...sections.filter((s) => s.contentType === "categoryPage"),
    ...subcategories,
    ...companies,
    ...places,
    ...events,
    ...articles,
  ].map((item) => toEntry(item, sectionNameByPath));
}
