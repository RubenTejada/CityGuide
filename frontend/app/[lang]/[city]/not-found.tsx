"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useWords } from "@/components/LocaleProvider";
import { contentSegments, localeHref } from "@/lib/i18n";

/**
 * A mistyped or retired URL under a city. It renders inside the city layout,
 * so the visitor keeps the header, the search box and the section tabs — which
 * is the point: the framework's own page hands them a dead end instead.
 */
export default function CityNotFound() {
  const locale = useLocale();
  const words = useWords();
  const citySlug = contentSegments(usePathname() ?? "")[0];
  return (
    <main className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="text-3xl font-bold sm:text-4xl">{words.notFound.title}</h1>
      <p className="mt-4 text-neutral-600">{words.notFound.body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {citySlug && (
          <Link
            href={localeHref(locale, `/${citySlug}`)}
            className="rounded-full bg-sun-400 px-5 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm transition-colors hover:bg-sun-300"
          >
            {words.notFound.backToCity}
          </Link>
        )}
        <Link
          href={localeHref(locale, "/")}
          className="rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold transition-colors hover:border-brand-500 hover:text-brand-600"
        >
          {words.notFound.backHome}
        </Link>
      </div>
    </main>
  );
}
