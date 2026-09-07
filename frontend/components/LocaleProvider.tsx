"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, t, type Dictionary, type Locale } from "@/lib/i18n";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * The language of the page, for the components that run in the browser.
 *
 * Server Components read it from the route (`activeLocale`), but a Client Component
 * cannot — and the alternative, a `locale` prop threaded through every card, map and
 * badge, would touch two dozen components to say the same thing each time. The
 * language never changes within a page, so a context is exactly the right shape.
 */
export default function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The dictionary of the page's language. */
export function useWords(): Dictionary {
  return t(useContext(LocaleContext));
}
