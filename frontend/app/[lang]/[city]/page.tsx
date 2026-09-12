import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleCard from "@/components/ArticleCard";
import { eventEntry } from "@/components/EventsList";
import EventTicker from "@/components/EventTicker";
import HeroCarousel, { type HeroSlide } from "@/components/HeroCarousel";
import JsonLd from "@/components/JsonLd";
import PlaceCard from "@/components/PlaceCard";
import {
  activeLocale,
  alternateOf,
  getChildren,
  getDescendantsOfType,
  getItem,
} from "@/lib/cms";
import {
  byRating,
  isComingSoon,
  num,
  photoUrl,
  text,
  type UmbracoItem,
} from "@/lib/umbraco";
import { localeHref, t, type Locale } from "@/lib/i18n";
import { sectionListImage } from "@/lib/sections";
import {
  absoluteImage,
  absoluteUrl,
  breadcrumbJsonLd,
  isNoIndex,
  itemListJsonLd,
  pageMetadata,
  prune,
  seoDescription,
  seoTitle,
} from "@/lib/seo";

export const revalidate = 600;

/**
 * No city is prerendered at build time — the portal opens new ones from the
 * backoffice — but a route with no `generateStaticParams` at all is rendered
 * from scratch on every request. The empty array asks for the other behaviour:
 * rendered the first time the path is asked for, then served from the ISR cache.
 */
export function generateStaticParams() {
  return [];
}

/** What the home page's ticker rotates through: three windows of three. */
const HOME_EVENTS = 9;
/** What a place needs before its rating means anything for the front page. */
const MIN_REVIEWS = 100;

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/[city]">): Promise<Metadata> {
  const { lang, city: citySlug } = await params;
  const locale = lang as Locale;
  const words = t(locale).seo;
  const city = await getItem(`/${citySlug}`);
  if (!city) return {};
  return pageMetadata({
    title: seoTitle(
      city,
      words.cityTitle(city.name),
      words.cityTitleShort(city.name),
    ),
    description: seoDescription(
      city,
      text(city, "intro"),
      words.cityFallback(city.name),
    ),
    path: city.route.path,
    locale,
    alternate: await alternateOf(city, locale),
    image: photoUrl(city),
    noIndex: isNoIndex(city) || isComingSoon(city),
  });
}

/**
 * Image for a section's slide/card: the section's own photo (set in the
 * backoffice) wins; then the first place photo found under it, then the
 * section's curated list image, then bundled artwork.
 */
function sectionImage(section: UmbracoItem, places: UmbracoItem[]): string {
  const own = photoUrl(section);
  if (own) return own;
  for (const place of places) {
    if (!place.route.path.startsWith(section.route.path)) continue;
    const photo = photoUrl(place);
    if (photo) return photo;
  }
  return sectionListImage(section.route.path);
}

/** A city announced in the switcher whose guide is not written yet. */
async function ComingSoon({ city }: { city: UmbracoItem }) {
  const locale = await activeLocale();
  const words = t(locale);
  return (
    <main>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: words.nav.home, path: localeHref(locale, "/") },
          { name: city.name, path: city.route.path },
        ])}
      />
      <section className="mx-auto max-w-2xl px-6 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
          {words.city.comingSoon}
        </p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
          {words.city.comingSoonHeading(city.name)}
        </h1>
        <p className="mt-4 text-neutral-600">
          {text(city, "intro") || words.city.comingSoonBody(city.name)}
        </p>
        <Link
          href={localeHref(locale, "/")}
          className="mt-8 inline-block rounded-full bg-sun-400 px-5 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm transition-colors hover:bg-sun-300"
        >
          {words.city.otherCity}
        </Link>
      </section>
    </main>
  );
}

export default async function CityLandingPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const locale = await activeLocale();
  const words = t(locale);
  const { city: citySlug } = await params;
  const city = await getItem(`/${citySlug}`);
  if (!city || city.contentType !== "city") notFound();

  if (isComingSoon(city)) return <ComingSoon city={city} />;

  const [sections, allPlaces, allEvents, allArticles] = await Promise.all([
    getChildren(city.route.path),
    // The whole city, because the section cards take the first photo they find
    // under each one and the best-rated block ranks every place there is.
    getDescendantsOfType(city.route.path, "place"),
    getDescendantsOfType(city.route.path, "eventItem", 60),
    getDescendantsOfType(city.route.path, "article", 20),
  ]);

  // The Delivery API answers in tree order, so which events are the next ones is
  // decided here: what has not ended yet, soonest first. The ticker shows three
  // at a time and rotates through the rest.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const events = allEvents
    .filter((event) => {
      const end = new Date(text(event, "endDate") || text(event, "startDate"));
      return !Number.isNaN(end.getTime()) && end >= todayStart;
    })
    .sort(
      (a, b) =>
        new Date(text(a, "startDate")).getTime() -
        new Date(text(b, "startDate")).getTime(),
    )
    .slice(0, HOME_EVENTS)
    .map(eventEntry);

  const categories = sections.filter((s) => s.contentType === "categoryPage");
  const eventsSection = sections.find((s) => s.contentType === "eventsPage");
  const articlesSection = sections.find(
    (s) => s.contentType === "articlesPage",
  );
  const articles = allArticles
    .sort((a, b) => {
      const time = (item: UmbracoItem) => {
        const value = item.properties["publishDate"];
        const t = typeof value === "string" ? new Date(value).getTime() : NaN;
        return Number.isNaN(t) ? 0 : t;
      };
      return time(b) - time(a);
    })
    .slice(0, 3);

  const slides: HeroSlide[] = categories.slice(0, 6).map((section) => ({
    href: section.route.path,
    title: section.name,
    blurb: text(section, "intro"),
    photo: sectionImage(section, allPlaces),
  }));

  // Best rated first, and only among places enough people have rated: a 5.0
  // from eleven reviews is not what the city is known for.
  const bestRated = allPlaces
    .filter(
      (p) =>
        photoUrl(p) !== null &&
        num(p, "googleRating") > 0 &&
        num(p, "googleRatingCount") > MIN_REVIEWS,
    )
    .sort(byRating)
    .slice(0, 6);

  return (
    <main>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: words.nav.home, path: localeHref(locale, "/") },
            { name: city.name, path: city.route.path },
          ]),
          prune({
            "@context": "https://schema.org",
            "@type": "City",
            "@id": absoluteUrl(city.route.path),
            name: city.name,
            url: absoluteUrl(city.route.path),
            description: text(city, "intro") || undefined,
            image: absoluteImage(photoUrl(city)),
            containedInPlace: text(city, "country")
              ? { "@type": "Country", name: text(city, "country") }
              : undefined,
            geo:
              typeof city.properties["latitude"] === "number" &&
              typeof city.properties["longitude"] === "number"
                ? {
                    "@type": "GeoCoordinates",
                    latitude: city.properties["latitude"],
                    longitude: city.properties["longitude"],
                  }
                : undefined,
          }),
          itemListJsonLd(`Secciones de ${city.name}`, sections),
        ]}
      />
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 pt-8 pb-3">
          <h1 className="text-3xl font-bold sm:text-4xl">{city.name}</h1>
          <p className="mt-2 max-w-2xl text-neutral-600">
            {text(city, "intro")}
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 pt-4 pb-10 lg:grid-cols-[1fr_352px] lg:gap-12">
        <div>
          <HeroCarousel slides={slides} />

          <h2 className="mt-10 text-xl font-semibold">
            {words.city.lookingFor}
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {sections.map((section) => {
              const photo = sectionImage(section, allPlaces);
              return (
                <Link
                  key={section.id}
                  href={section.route.path}
                  className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className="relative h-28 bg-neutral-900">
                    <Image
                      src={photo}
                      alt={section.name}
                      fill
                      unoptimized={photo.endsWith(".svg")}
                      className="object-cover transition duration-300 group-hover:scale-105"
                      sizes="(min-width: 640px) 220px, 50vw"
                    />
                  </div>
                  <p className="p-3 text-center font-medium group-hover:text-brand-600">
                    {section.name}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Beside the sections grid the events column is taken out of the flow,
            so the row is as tall as the sections are and the column has a height
            to fill — in the flow its own height would be what decided the row's,
            and the ticker would measure the space it had just taken. It hangs
            3rem above the row (the heading line plus the gap under it), so the
            first event card starts level with the carousel; the rule down its
            left is what keeps the two columns of photos apart. */}
        <div className="lg:relative">
          <aside className="border-t border-neutral-200 pt-8 lg:absolute lg:inset-x-0 lg:-top-12 lg:bottom-0 lg:flex lg:flex-col lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {words.city.upcomingEvents}
              </h2>
              {eventsSection && (
                <Link
                  href={eventsSection.route.path}
                  className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-neutral-700"
                >
                  {words.city.seeAllEvents}
                </Link>
              )}
            </div>
            {/* Beside the sections grid the column has a height of its own, and the
                ticker takes what is left of it so both columns end level. */}
            <div className="mt-5 lg:min-h-0 lg:flex-1">
              {events.length > 0 ? (
                <EventTicker events={events} locale={locale} />
              ) : (
                <p className="text-sm text-neutral-500">
                  {words.city.noEvents}
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>

      {articles.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {words.city.latestArticles}
            </h2>
            {articlesSection && (
              <Link
                href={articlesSection.route.path}
                className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-neutral-700"
              >
                {words.city.seeAllArticles}
              </Link>
            )}
          </div>
          <div className="mt-5 space-y-5">
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                compact
                locale={locale}
              />
            ))}
          </div>
        </section>
      )}

      {bestRated.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="text-xl font-semibold">{words.city.bestRated}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {bestRated.map((place) => (
              <PlaceCard key={place.id} place={place} locale={locale} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
