"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CityEmblem } from "@/components/CityBadge";
import { PendingLink } from "@/components/LoadingOverlay";
import { useWords } from "@/components/LocaleProvider";
import type { NavIcon } from "@/lib/sections";

/** Una página de la ruta: su nombre, su URL y el icono que la representa. */
export type CrumbLink = { name: string; path: string; icon: NavIcon };

/**
 * Un escalón de la ruta. `siblings` son las páginas por las que se puede
 * cambiar ahí mismo — las demás ciudades, las demás secciones, los demás
 * tipos —, vacío en el escalón que no lleva a ninguna parte (un local, una
 * película). El servidor las resuelve; aquí solo se despliegan.
 */
export type Crumb = CrumbLink & { siblings: CrumbLink[] };

/**
 * La ruta de navegación, sobre una banda gris que la separa de la página: es
 * el único bloque del contenido con fondo propio, así se lee como cabecera del
 * documento y no como su primera línea de texto.
 *
 * Cada escalón lleva su icono, y el que tiene hermanos lleva además el selector
 * que los abre: desde la ficha de un restaurante se salta a otra cocina o a
 * otra sección sin volver atrás.
 */
export default function Breadcrumb({ trail }: { trail: Crumb[] }) {
  const words = useWords();
  const bar = useRef<HTMLElement>(null);
  const pathname = usePathname();
  // El menú abierto se recuerda junto a la página en la que se abrió, así se
  // cierra solo al llegar a la elegida: el componente sobrevive a la
  // navegación dentro de la sección. Fuera se cierra al pulsar y con Escape.
  const [menu, setMenu] = useState<{ crumb: string; at: string } | null>(null);
  const open = menu?.at === pathname ? menu.crumb : null;
  const setOpen = (crumb: string | null) =>
    setMenu(crumb ? { crumb, at: pathname } : null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!bar.current?.contains(event.target as Node)) setMenu(null);
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
    <nav ref={bar} aria-label={words.nav.breadcrumb} className="my-3 text-sm">
      <ol className="flex w-full flex-wrap items-center gap-y-1 rounded-2xl bg-neutral-200 px-2 py-1.5">
        {trail.map((crumb, index) => {
          const current = index === trail.length - 1;
          return (
            <li key={crumb.path} className="relative flex items-center">
              <PendingLink
                href={crumb.path}
                aria-current={current ? "page" : undefined}
                className={`flex max-w-[14rem] items-center gap-2 rounded-xl py-1 pr-2 pl-1 transition-colors sm:max-w-none ${
                  current
                    ? "bg-white font-semibold text-neutral-900 shadow-sm"
                    : "text-neutral-700 hover:bg-white hover:text-brand-700"
                }`}
              >
                <CrumbIcon icon={crumb.icon} />
                <span className="truncate">{crumb.name}</span>
              </PendingLink>

              {crumb.siblings.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setOpen(open === crumb.path ? null : crumb.path)
                  }
                  aria-expanded={open === crumb.path}
                  aria-haspopup="menu"
                  aria-label={`${words.nav.otherOptions}: ${crumb.name}`}
                  className="ml-0.5 rounded-lg p-1 text-neutral-500 transition-colors hover:bg-white hover:text-neutral-900"
                >
                  <SwitchIcon />
                </button>
              )}

              {!current && (
                // El separador es lo que hace legible la ruta de un vistazo:
                // va en la tinta del texto, no en un gris de fondo, y algo
                // mayor que las etiquetas para marcar el salto de nivel.
                <span
                  aria-hidden
                  className="px-1.5 text-2xl leading-none font-bold text-neutral-700"
                >
                  ›
                </span>
              )}

              {open === crumb.path && (
                <div
                  role="menu"
                  aria-label={`${words.nav.otherOptions}: ${crumb.name}`}
                  className="absolute top-full left-0 z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-lg"
                >
                  {crumb.siblings.map((sibling) => {
                    const here = sibling.path === crumb.path;
                    return (
                      <PendingLink
                        key={sibling.path}
                        href={sibling.path}
                        role="menuitem"
                        aria-current={here ? "page" : undefined}
                        className={`flex items-center gap-2.5 rounded-xl px-2 py-2 ${
                          here
                            ? "bg-neutral-50 font-semibold text-neutral-900"
                            : "text-neutral-700 hover:bg-neutral-50"
                        }`}
                      >
                        <CrumbIcon icon={sibling.icon} />
                        <span className="min-w-0 flex-1 truncate">
                          {sibling.name}
                        </span>
                        <span
                          aria-hidden
                          className={`h-4 w-4 flex-none rounded-full border ${
                            here
                              ? "border-brand-600 bg-brand-600 ring-2 ring-white ring-inset"
                              : "border-neutral-300"
                          }`}
                        />
                      </PendingLink>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * La placa del icono. Los dibujos de sección traen su propio fondo blanco
 * (`logo-plate` lo mantiene también en oscuro, como en los pines del mapa) y el
 * emblema de la ciudad está dibujado en trazo blanco, así que va sobre negro.
 */
function CrumbIcon({ icon }: { icon: NavIcon }) {
  if (icon.kind === "site")
    return (
      <Image
        src="/logo.svg"
        alt=""
        width={24}
        height={24}
        unoptimized
        className="h-6 w-6 flex-none rounded-lg"
      />
    );
  if (icon.kind === "city")
    return (
      <span
        aria-hidden
        className="flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-lg bg-neutral-900"
      >
        <CityEmblem slug={icon.slug} ring={false} className="h-5 w-auto" />
      </span>
    );
  if (icon.kind === "image")
    return (
      <span className="logo-plate relative h-6 w-6 flex-none overflow-hidden rounded-lg bg-white">
        <Image
          src={icon.src}
          alt=""
          fill
          unoptimized
          sizes="24px"
          className="object-cover"
        />
      </span>
    );
  return (
    <span
      aria-hidden
      className="logo-plate flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-white text-[13px]"
    >
      {icon.glyph}
    </span>
  );
}

/** Las dos puntas del selector, como en un `select` nativo. */
function SwitchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 6.5 8 3.5l3 3" />
      <path d="M5 9.5 8 12.5l3-3" />
    </svg>
  );
}
