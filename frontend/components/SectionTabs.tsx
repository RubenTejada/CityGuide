"use client";

import { usePathname } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { Suspense, useEffect, useRef } from "react";
import { PendingLink } from "@/components/LoadingOverlay";

export type SectionTab = { id: string; href: string; label: string };

/**
 * The header's section bar. The tab of the section you are in stays lit —
 * including on the pages below it (a subcategory, a place) — so the bar says
 * where you are and not only where you can go.
 *
 * Past `sm` it wraps rather than scrolls, and a second row of tabs on a wide
 * screen reads as broken rather than as a bar. Nine sections in English came to
 * 1165px against the 1152px the container gives them, so the tabs are padded a
 * little tighter than the rest of the header and the longest label of a language
 * is shortened in `nav.shortLabels` — the lever "Empresas y Servicios" already
 * uses to fit as "Empresas".
 */
type SectionTabsProps = {
  /** "Inicio": selected only on the city page itself. */
  home: string;
  locale: Locale;
  sections: SectionTab[];
};

/**
 * Reading the path is what suspends: Cache Components prerenders a static
 * shell for a city's pages before their segments are known, and a hook in the
 * city layout that asks where it is would hold that whole shell back. So the bar is drawn
 * without a lit tab until the path is known — which a prerendered page always
 * is, so what a visitor gets is the bar with its tab lit.
 */
export default function SectionTabs(props: SectionTabsProps) {
  return (
    <Suspense fallback={<TabBar {...props} pathname={null} />}>
      <CurrentTabBar {...props} />
    </Suspense>
  );
}

function CurrentTabBar(props: SectionTabsProps) {
  return <TabBar {...props} pathname={usePathname()} />;
}

function TabBar({
  home,
  locale,
  sections,
  pathname: path,
}: SectionTabsProps & { pathname: string | null }) {
  // The CMS gives section paths with a trailing slash; `usePathname` never has
  // one, so both sides are trimmed before comparing.
  const pathname = path === null ? null : trim(path);
  const inSection = (href: string) =>
    pathname !== null &&
    (pathname === trim(href) || pathname.startsWith(`${trim(href)}/`));

  // La fila deslizable del móvil deja fuera de pantalla la pestaña encendida
  // («Artículos» está al final): se centra sola, así la barra sigue diciendo
  // dónde estás. Se mueve solo la barra, nunca la página.
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = bar.current;
    const tab = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !tab) return;
    const offset =
      tab.getBoundingClientRect().left -
      row.getBoundingClientRect().left -
      (row.clientWidth - tab.offsetWidth) / 2;
    row.scrollLeft += offset;
  }, [pathname]);

  return (
    <nav className="border-t border-neutral-800">
      {/* En el móvil las secciones no caben en una línea y envueltas ocupaban
          media pantalla: una sola fila deslizable, y a partir de `sm` la
          barra de siempre. */}
      <div
        ref={bar}
        className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6 [scrollbar-width:none] sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden"
      >
        <Tab href={home} active={pathname !== null && pathname === trim(home)}>
          {t(locale).nav.home}
        </Tab>
        {sections.map((section) => (
          <Tab
            key={section.id}
            href={section.href}
            active={inSection(section.href)}
          >
            {section.label}
          </Tab>
        ))}
      </div>
    </nav>
  );
}

/** "/a/b/" and "/a/b" are the same section. The site root stays "/". */
function trim(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <PendingLink
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mt-px shrink-0 rounded-t-md border-t-2 px-2.5 py-3 text-sm font-medium tracking-wide uppercase transition-colors ${
        active
          ? "border-sun-300 bg-neutral-800 text-white"
          : "border-transparent text-neutral-300 hover:bg-neutral-800/60 hover:text-white"
      }`}
    >
      {children}
    </PendingLink>
  );
}
