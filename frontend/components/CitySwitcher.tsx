"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CityEmblem } from "@/components/CityBadge";
import { PendingLink } from "@/components/LoadingOverlay";
import { useWords } from "@/components/LocaleProvider";

/** Una ciudad del selector: lo justo para dibujarla y enlazarla. */
export type CityOption = {
  slug: string;
  name: string;
  href: string;
  comingSoon: boolean;
};

/**
 * El emblema de la ciudad en la cabecera es también el selector: dice dónde
 * estás y despliega las demás ciudades ahí mismo, sin pasar por el portal.
 * El enlace al portal se queda al pie del menú, para quien quiera verlas todas
 * con su tarjeta.
 *
 * El menú se cierra al pulsar fuera, con Escape y al llegar a la ciudad
 * elegida: la cabecera sobrevive a la navegación entre ciudades, así que el
 * estado abierto se recuerda junto a la ruta en la que se abrió.
 */
export default function CitySwitcher({
  current,
  cities,
  allCitiesHref,
}: {
  current: CityOption;
  cities: CityOption[];
  allCitiesHref: string;
}) {
  const words = useWords();
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [menu, setMenu] = useState<string | null>(null);
  const open = menu === pathname;

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
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setMenu(open ? null : pathname)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${words.nav.changeCity}: ${current.name}`}
        title={words.nav.changeCity}
        className={`flex w-full flex-col items-center rounded-2xl px-2 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun-300 ${
          open ? "bg-neutral-800" : "hover:bg-neutral-800"
        }`}
      >
        <CityEmblem
          slug={current.slug}
          ring={false}
          className="h-20 w-auto sm:h-32"
        />
        <span className="mt-2 flex items-center gap-1.5 text-xs font-light tracking-[0.28em] text-white uppercase">
          {current.name}
          <ChevronIcon open={open} />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={words.nav.changeCity}
          className="absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 p-1.5 text-white shadow-2xl sm:left-auto sm:right-0 sm:translate-x-0"
        >
          {cities.map((city) => {
            const here = city.slug === current.slug;
            return (
              <PendingLink
                key={city.slug}
                href={city.href}
                role="menuitem"
                aria-current={here ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm transition-colors ${
                  here
                    ? "bg-neutral-800 font-semibold"
                    : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                }`}
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-lg bg-neutral-800"
                >
                  <CityEmblem
                    slug={city.slug}
                    ring={false}
                    className="h-6 w-auto"
                  />
                </span>
                <span className="min-w-0 flex-1 truncate">{city.name}</span>
                {city.comingSoon && (
                  <span className="flex-none rounded-full bg-sun-400 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-900 uppercase">
                    {words.city.comingSoon}
                  </span>
                )}
                {here && !city.comingSoon && (
                  <span
                    aria-hidden
                    className="h-4 w-4 flex-none rounded-full border border-brand-500 bg-brand-500 ring-2 ring-neutral-900 ring-inset"
                  />
                )}
              </PendingLink>
            );
          })}

          <PendingLink
            href={allCitiesHref}
            role="menuitem"
            className="mt-1 flex items-center justify-center gap-1.5 border-t border-neutral-800 px-2 pt-2.5 pb-1.5 text-xs tracking-wide text-neutral-400 transition-colors hover:text-white"
          >
            {words.city.otherCity}
            <span aria-hidden>›</span>
          </PendingLink>
        </div>
      )}
    </div>
  );
}

/** La punta del desplegable, girada cuando el menú está abierto. */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6.5 8 10.5l4-4" />
    </svg>
  );
}
