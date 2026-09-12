"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { otherLocale, t, type Locale } from "@/lib/i18n";

/**
 * The classes the link and the placeholder its Suspense boundary shows both
 * wear, so the corner of the header never changes size or colour between them.
 */
export const LANGUAGE_TOGGLE_CLASS =
  "rounded-lg px-2 py-1.5 text-xs font-semibold tracking-wide text-neutral-400 uppercase transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun-300";

/**
 * The link itself. It reads the query string, which is a request-time API: on a
 * page rendered for the request (a listing, the search) the server writes the
 * real href, query and all, and on a prerendered one this renders in the
 * browser, under the boundary its wrapper puts around it.
 */
export default function LanguageToggleLink({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const other = otherLocale(locale);
  const target = `${pathname}${search ? `?${search}` : ""}`;

  return (
    <a
      href={`/api/language?to=${other}&path=${encodeURIComponent(target)}`}
      hrefLang={other}
      title={t(locale).nav.language}
      className={LANGUAGE_TOGGLE_CLASS}
    >
      {other}
    </a>
  );
}
