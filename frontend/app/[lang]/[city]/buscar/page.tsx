import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlaceCard from "@/components/PlaceCard";
import { localeHref, t, type Locale } from "@/lib/i18n";
import { fold } from "@/lib/search";
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

/** Case/accent-insensitive match over the fields shown in listings. */
function matches(item: UmbracoItem, needle: string): boolean {
  return fold(
    [
      item.name,
      text(item, "address"),
      text(item, "description"),
      text(item, "venueName"),
    ].join(" "),
  ).includes(needle);
}

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

  const needle = fold(q.trim());

  let places: UmbracoItem[] = [];
  let companies: UmbracoItem[] = [];
  let events: UmbracoItem[] = [];

  if (needle) {
    [places, companies, events] = await Promise.all([
      getDescendantsOfType(city.route.path, "place"),
      getDescendantsOfType(city.route.path, "company"),
      getDescendantsOfType(city.route.path, "eventItem"),
    ]);
    places = places.filter((p) => matches(p, needle));
    companies = companies.filter((c) => matches(c, needle));
    events = events.filter((e) => matches(e, needle));
  }

  const total = places.length + companies.length + events.length;

  // Branch names repeat across chains ("Oficina Principal"): the card shows the
  // company that owns the branch, found by path prefix among the same results.
  const allCompanies = needle
    ? await getDescendantsOfType(city.route.path, "company")
    : [];
  const companyOf = (place: UmbracoItem) =>
    allCompanies.find((c) => place.route.path.startsWith(c.route.path)) ?? null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {!needle ? (
        <p className="text-neutral-600">{words.search.prompt}</p>
      ) : (
        <>
          <h1 className="text-2xl font-bold">
            {words.search.heading(q.trim())}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {words.search.count(total)}
            {words.search.inCity(city.name)}
          </p>

          {[...companies, ...places].length > 0 && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[...companies, ...places].map((item) => (
                <PlaceCard
                  key={item.id}
                  place={item}
                  company={
                    item.contentType === "place" ? companyOf(item) : null
                  }
                  locale={locale}
                />
              ))}
            </div>
          )}

          {events.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">{words.map.events}</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {events.map((event) => (
                  <Link
                    key={event.id}
                    href={event.route.path}
                    className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <h3 className="font-semibold">{event.name}</h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      {text(event, "venueName")}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-neutral-600">
                      {text(event, "description")}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {total === 0 && (
            <p className="mt-6 text-neutral-600">{words.search.empty}</p>
          )}
        </>
      )}
    </main>
  );
}
