"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { PendingLink } from "@/components/LoadingOverlay";

export type SectionTab = { id: string; href: string; label: string };

/**
 * The header's section bar. The tab of the section you are in stays lit —
 * including on the pages below it (a subcategory, a place) — so the bar says
 * where you are and not only where you can go.
 */
export default function SectionTabs({
  home,
  sections,
}: {
  /** "Inicio": selected only on the city page itself. */
  home: string;
  sections: SectionTab[];
}) {
  // The CMS gives section paths with a trailing slash; `usePathname` never has
  // one, so both sides are trimmed before comparing.
  const pathname = trim(usePathname());
  const inSection = (href: string) =>
    pathname === trim(href) || pathname.startsWith(`${trim(href)}/`);

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
        <Tab href={home} active={pathname === trim(home)}>
          Inicio
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
      className={`-mt-px shrink-0 rounded-t-md border-t-2 px-3 py-3 text-sm font-medium tracking-wide uppercase transition-colors ${
        active
          ? "border-sun-300 bg-neutral-800 text-white"
          : "border-transparent text-neutral-300 hover:bg-neutral-800/60 hover:text-white"
      }`}
    >
      {children}
    </PendingLink>
  );
}
