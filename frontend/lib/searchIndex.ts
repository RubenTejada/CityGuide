// Builds the city search index the autocomplete downloads. Server-only: it reads
// the CMS, so it must stay out of the bundle the autocomplete itself ships.

import { branchDisplayName } from "./branches";
import { getChildren, getDescendantsOfType } from "./cms";
import { t, type Locale } from "./i18n";
import { type SearchEntry } from "./search";
import { text, type UmbracoItem } from "./umbraco";

/** What the autocomplete calls each kind of result, in the index's language. */
function kindLabel(contentType: string, locale: Locale): string {
  return t(locale).search.kinds[contentType] ?? "";
}

/** The company a branch place hangs from, by path prefix; null for anything else. */
function companyOf(
  item: UmbracoItem,
  companyNameByPath: Map<string, string>,
): string | null {
  if (item.contentType !== "place") return null;
  for (const [companyPath, companyName] of companyNameByPath) {
    if (trimPath(item.route.path).startsWith(`${companyPath}/`)) {
      return companyName;
    }
  }
  return null;
}

/** Umbraco route paths may carry a trailing slash; strip it for prefix checks. */
function trimPath(path: string): string {
  return path.replace(/\/+$/, "");
}

function toEntry(
  item: UmbracoItem,
  sectionNameByPath: Map<string, string>,
  companyNameByPath: Map<string, string>,
  locale: Locale,
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
    name: branchDisplayName(item.name, companyOf(item, companyNameByPath)),
    path: item.route.path,
    kind: kindLabel(item.contentType, locale) || item.contentType,
    category,
    extra: text(item, "address") || text(item, "venueName"),
  };
}

/**
 * Precomputed autocomplete index for one city: categories, subcategories,
 * places, companies and events. Built from the (ISR-cached) Delivery API,
 * so repeat requests are served without hitting the CMS.
 */

export async function buildSearchIndex(
  cityPath: string,
  locale: Locale,
): Promise<SearchEntry[]> {
  const sections = (await getChildren(cityPath, undefined, locale)).filter(
    (s) =>
      s.contentType === "categoryPage" ||
      s.contentType === "eventsPage" ||
      s.contentType === "articlesPage",
  );
  const sectionNameByPath = new Map(
    sections.map((s) => [trimPath(s.route.path), s.name]),
  );

  const [subcategories, companies, places, events, articles] =
    await Promise.all([
      getDescendantsOfType(cityPath, "subcategory", undefined, locale),
      getDescendantsOfType(cityPath, "company", undefined, locale),
      getDescendantsOfType(cityPath, "place", undefined, locale),
      getDescendantsOfType(cityPath, "eventItem", undefined, locale),
      getDescendantsOfType(cityPath, "article", undefined, locale),
    ]);

  const companyNameByPath = new Map(
    companies.map((c) => [trimPath(c.route.path), c.name]),
  );

  return [
    ...sections.filter((s) => s.contentType === "categoryPage"),
    ...subcategories,
    ...companies,
    ...places,
    ...events,
    ...articles,
  ].map((item) => toEntry(item, sectionNameByPath, companyNameByPath, locale));
}
