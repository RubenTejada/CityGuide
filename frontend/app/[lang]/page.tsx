import type { Metadata } from "next";
import Link from "next/link";
import CityBadge from "@/components/CityBadge";
import JsonLd from "@/components/JsonLd";
import SiteLogo from "@/components/SiteLogo";
import ThemeToggle from "@/components/ThemeToggle";
import {
  itemListJsonLd,
  pageMetadata,
  siteDescription,
  siteTitle,
} from "@/lib/seo";
import { getCities } from "@/lib/cms";
import { localeHref, otherLocale, t, type Locale } from "@/lib/i18n";
import { isComingSoon, slugOf } from "@/lib/umbraco";

export const revalidate = 600;

// The root layout's defaults would cover the home page, but stating them here
// keeps every route's canonical, Open Graph and robots directives coming from
// the same builder. The title carries the brand already, so it is absolute.
export async function generateMetadata({
  params,
}: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  const locale = lang as Locale;
  const other = otherLocale(locale);
  return pageMetadata({
    title: siteTitle(locale),
    description: siteDescription(locale),
    path: localeHref(locale, "/"),
    locale,
    // The portal's front door exists in both languages, always.
    alternate: { locale: other, path: localeHref(other, "/") },
    absoluteTitle: true,
  });
}

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  const locale = lang as Locale;
  const words = t(locale);
  const cities = await getCities();

  return (
    <main className="flex-1">
      <JsonLd data={itemListJsonLd(words.home.listTitle, cities)} />
      <section className="relative bg-neutral-900 text-white">
        <ThemeToggle className="absolute top-3 right-3" />
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h1 className="flex justify-center">
            <SiteLogo
              className="text-4xl sm:text-5xl"
              tagline
              locale={locale}
            />
          </h1>
          <p className="mt-6 text-lg text-neutral-300">{words.home.lead}</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="text-xl font-semibold">{words.home.heading}</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((city) => (
            <Link
              key={city.id}
              href={localeHref(locale, `/${slugOf(city)}`)}
              className="relative block rounded-3xl shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <CityBadge city={city} />
              {isComingSoon(city) && (
                <span className="absolute top-3 right-3 rounded-full bg-sun-400 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-neutral-900 uppercase">
                  {words.city.comingSoon}
                </span>
              )}
            </Link>
          ))}
          {cities.length === 0 && (
            <p className="text-neutral-500">{words.home.empty}</p>
          )}
        </div>
      </section>
    </main>
  );
}
