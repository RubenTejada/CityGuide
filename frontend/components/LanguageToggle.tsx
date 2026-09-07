"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { otherLocale, t, type Locale } from "@/lib/i18n";

/**
 * Switches the page between Spanish and English.
 *
 * It cannot build the other language's URL itself: a page's path is translated
 * segment by segment ("/santo-domingo/restaurantes/china" against
 * "/en/santo-domingo/restaurants/chinese"), and only the CMS knows the pairing. So
 * the link goes to /api/language, which looks the page up by id in the language
 * asked for and redirects — and falls back to the same path under the other prefix
 * for the pages the CMS does not own (contact, search) and for anything nobody has
 * translated yet.
 */
export default function LanguageToggle({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const other = otherLocale(locale);
  const target = `${pathname}${search ? `?${search}` : ""}`;

  return (
    <a
      href={`/api/language?to=${other}&path=${encodeURIComponent(target)}`}
      hrefLang={other}
      title={t(locale).nav.language}
      className="rounded-lg px-2 py-1.5 text-xs font-semibold tracking-wide text-neutral-400 uppercase transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun-300"
    >
      {other}
    </a>
  );
}
