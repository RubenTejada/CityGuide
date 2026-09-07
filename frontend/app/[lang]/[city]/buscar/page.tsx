import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlaceCard from "@/components/PlaceCard";
import { localeHref, t, type Locale } from "@/lib/i18n";
import { matchesTokens, searchText, searchTokens } from "@/lib/search";
import { buildSearchIndex } from "@/lib/searchIndex";
import { activeLocale, getDescendantsOfType, getItem } from "@/lib/cms";
import { text, type UmbracoItem } from "@/lib/umbraco";

export const revalidate = 600;

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/[city]/buscar">): Promise<Metadata> {
  const { lang, city: citySlug } = await params;
  const locale = lang as Locale;
  const words = t(locale).search;
  const city = await getItem(`/${citySlug}`);
  const name = city?.name ?? words.theCity;
  return {
    title: words.title(name),
    description: words.metaDescription(name),
    // Result pages are thin and unbounded: crawl the links, index nothing. They
    // declare no hreflang pair either: a page out of the index has nothing to pair.
    robots: { index: false, follow: true },
    alternates: { canonical: localeHref(locale, `/${citySlug}/buscar`) },
  };
}

/** Umbraco route paths may carry a trailing slash; strip it before keying by path. */
function trimPath(path: string): string {
  return path.replace(/\/+$/, "");
}

/**
 * Search results for one city. The corpus and the matcher are the search
 * index's (`buildSearchIndex`, `matchesTokens`) — the very ones the header
 * autocomplete filters in the browser — so the dropdown can never promise a
 * result this page then denies. What the index does not carry is a place's
 * description: it ships to every visitor, so prose-only matches do not score.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const locale = await activeLocale();
  const words = t(locale);
  const [{ city: citySlug }, { q = "" }] = await Promise.all([
    params,
    searchParams,
  ]);
  const city = await getItem(`/${citySlug}`);
  if (!city || city.contentType !== "city") notFound();

  const tokens = searchTokens(q);

  // The index is a flat projection; the cards need the nodes themselves. Both
  // ask the Delivery API the same questions, so the request cache answers the
  // second one for free.
  const [index, places, companies, malls, events] = tokens.length
    ? await Promise.all([
        buildSearchIndex(city.route.path, locale),
        getDescendantsOfType(city.route.path, "place", undefined, locale),
        getDescendantsOfType(city.route.path, "company", undefined, locale),
        getDescendantsOfType(city.route.path, "mall", undefined, locale),
        getDescendantsOfType(city.route.path, "eventItem", undefined, locale),
      ])
    : [[], [], [], [], []];

  const hits = index.filter((entry) =>
    matchesTokens(searchText(entry), tokens),
  );
  const itemByPath = new Map<string, UmbracoItem>(
    [...companies, ...malls, ...places, ...events].map((item) => [
      trimPath(item.route.path),
      item,
    ]),
  );
  const found = hits.map((entry) => ({
    entry,
    item: itemByPath.get(trimPath(entry.path)) ?? null,
  }));

  // Branch names repeat across chains ("Oficina Principal"): the card shows the
  // company that owns the branch, found by path prefix among the same results.
  const companyOf = (place: UmbracoItem) =>
    companies.find((c) => place.route.path.startsWith(c.route.path)) ?? null;

  const isPlaceLike = (contentType: string) =>
    contentType === "place" ||
    contentType === "company" ||
    contentType === "mall";
  const cards = found.filter((hit) => hit.item && isPlaceLike(hit.item.contentType));
  const eventHits = found.filter(
    (hit) => hit.item?.contentType === "eventItem",
  );
  // Sections, subcategories, articles and films have no card of their own: they
  // are listed as the rows the autocomplete shows, so a search for a plaza's
  // section or for a film title still leads somewhere.
  const links = found.filter(
    (hit) => !hit.item || !isPlaceLike(hit.item.contentType),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {tokens.length === 0 ? (
        <p className="text-neutral-600">{words.search.prompt}</p>
      ) : (
        <>
          <h1 className="text-2xl font-bold">
            {words.search.heading(q.trim())}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {words.search.count(found.length)}
            {words.search.inCity(city.name)}
          </p>

          {cards.length > 0 && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {cards.map(({ entry, item }) => (
                <PlaceCard
                  key={entry.path}
                  place={item!}
                  company={
                    item!.contentType === "place" ? companyOf(item!) : null
                  }
                  locale={locale}
                />
              ))}
            </div>
          )}

          {eventHits.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">{words.map.events}</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {eventHits.map(({ entry, item }) => (
                  <Link
                    key={entry.path}
                    href={entry.path}
                    className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <h3 className="font-semibold">{item!.name}</h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      {text(item!, "venueName")}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-neutral-600">
                      {text(item!, "description")}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {links.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">{words.search.moreLinks}</h2>
              <ul className="mt-4 divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                {links.map(({ entry }) => (
                  <li key={entry.path}>
                    <Link
                      href={entry.path}
                      className="block px-4 py-3 transition hover:bg-neutral-50"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-medium text-neutral-900">
                          {entry.name}
                        </span>
                        <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                          {entry.kind}
                        </span>
                      </div>
                      {(entry.category || entry.extra) && (
                        <p className="mt-0.5 truncate text-sm text-neutral-500">
                          {[entry.category, entry.extra]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {found.length === 0 && (
            <p className="mt-6 text-neutral-600">{words.search.empty}</p>
          )}
        </>
      )}
    </main>
  );
}
