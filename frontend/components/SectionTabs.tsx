"use client";

import { usePathname } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { Suspense, useEffect, useRef, useState } from "react";
import { PendingLink } from "@/components/LoadingOverlay";

export type SectionTab = { id: string; href: string; label: string };

/**
 * The header's section bar. The tab of the section you are in stays lit —
 * including on the pages below it (a subcategory, a place) — so the bar says
 * where you are and not only where you can go.
 *
 * On a phone the sections do not fit in one line, so the bar is a hamburger
 * button carrying the section you are in, which drops the full list over the
 * page. Past `sm` it is the row of tabs.
 *
 * That row wraps rather than scrolls, and a second row of tabs on a wide
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
  const words = t(locale);
  // The CMS gives section paths with a trailing slash; `usePathname` never has
  // one, so both sides are trimmed before comparing.
  const pathname = path === null ? null : trim(path);
  const inSection = (href: string) =>
    pathname !== null &&
    (pathname === trim(href) || pathname.startsWith(`${trim(href)}/`));

  const tabs = [
    {
      id: "home",
      href: home,
      label: words.nav.home,
      active: pathname !== null && pathname === trim(home),
    },
    ...sections.map((section) => ({
      ...section,
      active: inSection(section.href),
    })),
  ];
  const current = tabs.find((tab) => tab.active);

  // El menú del móvil se recuerda junto a la ruta en la que se abrió, como el
  // selector de ciudad: la cabecera sobrevive a la navegación, y al llegar a
  // la sección elegida el menú ya está cerrado.
  const box = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const open = pathname !== null && menu === pathname;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <nav ref={box} className="relative border-t border-neutral-800">
      {/* En el móvil las secciones no caben en una línea: un botón
          hamburguesa que dice en qué sección estás y despliega las demás
          encima de la página. A partir de `sm`, la barra de siempre. */}
      <button
        type="button"
        onClick={() => setMenu(open ? null : pathname)}
        aria-expanded={open}
        aria-controls="section-menu"
        aria-label={words.nav.openSections}
        className={`flex w-full items-center gap-3 px-6 py-3 text-sm font-medium tracking-wide text-white uppercase transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sun-300 sm:hidden ${
          open ? "bg-neutral-800" : "hover:bg-neutral-800/60"
        }`}
      >
        <HamburgerIcon open={open} />
        <span className="min-w-0 flex-1 truncate text-left">
          {current?.label ?? words.nav.sections}
        </span>
      </button>

      {open && (
        <div
          id="section-menu"
          // Un toque en una sección cierra el menú en cuanto empieza la
          // navegación, sin esperar a que llegue la página.
          onClick={(event) => {
            if ((event.target as Element).closest("a")) setMenu(null);
          }}
          className="absolute inset-x-0 top-full z-40 max-h-[70vh] overflow-y-auto border-t border-neutral-800 bg-neutral-900 p-2 shadow-2xl sm:hidden"
        >
          {tabs.map((tab) => (
            <PendingLink
              key={tab.id}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`block rounded-lg border-l-2 px-4 py-3 text-sm font-medium tracking-wide uppercase transition-colors ${
                tab.active
                  ? "border-sun-300 bg-neutral-800 text-white"
                  : "border-transparent text-neutral-300 hover:bg-neutral-800/60 hover:text-white"
              }`}
            >
              {tab.label}
            </PendingLink>
          ))}
        </div>
      )}

      <div className="mx-auto hidden max-w-6xl flex-wrap gap-1 px-6 sm:flex">
        {tabs.map((tab) => (
          <Tab key={tab.id} href={tab.href} active={tab.active}>
            {tab.label}
          </Tab>
        ))}
      </div>
    </nav>
  );
}

/** Las tres rayas, que se cruzan en una X con el menú abierto. */
function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-6 w-6 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {open ? (
        <path d="M6 6l12 12M18 6 6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
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
