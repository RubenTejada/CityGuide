"use client";

import Image from "next/image";
import { useState } from "react";

import ImageViewer from "@/components/ImageViewer";
import { useWords } from "@/components/LocaleProvider";

function sourceHost(source: string | null): string | null {
  try {
    return source ? new URL(source).host : null;
  } catch {
    return null;
  }
}

/**
 * El menú de un lugar: la primera página como muestra y, al pulsarla, todas en grande
 * en el mismo visor que usa la galería de fotos.
 *
 * Es un botón y no una sección abierta porque una carta se lee cuando se busca, no de
 * paso: en la página ocupa una línea, y quien quiere verla la abre. Un lugar sin menú
 * no muestra nada — la mitad de los restaurantes publican su carta solo en redes, y ahí
 * no hay nada que leer.
 */
export default function MenuViewer({
  pages,
  name,
  source,
}: {
  pages: string[];
  name: string;
  source: string | null;
}) {
  const words = useWords();
  const [viewing, setViewing] = useState<number | null>(null);
  // El origen lo escribe el agente, pero un editor puede corregirlo a mano: una
  // dirección que no lo es se queda sin línea en vez de romper la página.
  const host = sourceHost(source);

  return (
    <>
      <button
        type="button"
        onClick={() => setViewing(0)}
        className="group flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
      >
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
          <Image
            src={pages[0]}
            alt=""
            fill
            sizes="3.5rem"
            className="object-cover"
          />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-brand-700 group-hover:underline">
            {words.place.menu}
          </span>
          <span className="block text-xs text-neutral-600">
            {words.place.menuPages(pages.length)}
          </span>
        </span>
      </button>

      {source && host && (
        <p className="mt-1.5 text-xs text-neutral-500">
          {words.place.menuFrom}{" "}
          <a
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:underline"
          >
            {host}
          </a>
        </p>
      )}

      {viewing !== null && (
        <ImageViewer
          images={pages}
          name={name}
          start={viewing}
          labels={{
            title: words.place.menu,
            count: words.place.galleryCount,
            open: words.place.menuOpen,
            previous: words.place.menuPrevious,
            next: words.place.menuNext,
            close: words.place.menuClose,
          }}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
