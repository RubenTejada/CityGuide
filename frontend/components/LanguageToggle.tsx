import { Suspense } from "react";
import LanguageToggleLink, {
  LANGUAGE_TOGGLE_CLASS,
} from "@/components/LanguageToggleLink";
import { otherLocale, type Locale } from "@/lib/i18n";

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
 *
 * It carries the query string across with it, which is what `/api/language` puts
 * back on the destination — the page of a listing, the day of a cartelera, the
 * words typed into the search. Reading it is a request-time API, and this
 * component sits in the layout of every city page: without the boundary below,
 * one language link would keep the whole portal out of the prerender and every
 * place, plaza and article would be rendered again on every visit. Inside it,
 * a page rendered for the request still writes the href on the server, and a
 * prerendered one — which has no query to carry anyway — ships the placeholder
 * and fills it in as soon as the browser takes over.
 */
export default function LanguageToggle({ locale }: { locale: Locale }) {
  return (
    <Suspense
      fallback={
        <span className={LANGUAGE_TOGGLE_CLASS} aria-hidden>
          {otherLocale(locale)}
        </span>
      }
    >
      <LanguageToggleLink locale={locale} />
    </Suspense>
  );
}
