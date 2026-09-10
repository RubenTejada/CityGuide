"use client";

import { useState } from "react";

import { useWords } from "@/components/LocaleProvider";
import Modal from "@/components/Modal";
import MenuNote from "@/components/MenuNote";
import MenuSections from "@/components/MenuSections";
import type { MenuGroup } from "@/lib/menu";

/**
 * El menú escrito de un lugar: un botón en la ficha y, detrás, la carta entera en un
 * modal.
 *
 * Detrás de un botón y no desplegada en la página por lo mismo que las páginas
 * escaneadas: una carta de treinta platos empuja el resto de la ficha — el mapa, lo que
 * hay cerca — fuera de la pantalla, y se consulta cuando se busca, no de paso. Dentro
 * del modal va también de dónde salió y cuándo, que es donde alguien está mirando un
 * precio.
 *
 * La ventana en sí es <Modal>, la misma que abre el formulario de reserva.
 */
export default function MenuDialog({
  sections,
  source,
  captured,
}: {
  sections: MenuGroup[];
  source: string | null;
  captured: string | null;
}) {
  const words = useWords();
  const [open, setOpen] = useState(false);
  const dishes = sections.reduce((total, section) => total + section.items.length, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 group-hover:bg-white">
          <MenuIcon />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-brand-700 group-hover:underline">
            {words.place.menu}
          </span>
          <span className="block text-xs text-neutral-600">
            {words.place.menuDishes(dishes)}
          </span>
        </span>
      </button>

      {open && (
        <Modal
          title={words.place.menuHeading}
          close={words.place.menuClose}
          onClose={() => setOpen(false)}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <MenuSections sections={sections} />
          </div>
          <MenuNote
            source={source}
            captured={captured}
            className="border-t border-neutral-200 bg-neutral-50 px-5 py-3 text-neutral-500"
          />
        </Modal>
      )}
    </>
  );
}

/** Cubiertos: lo que dice "carta" sin una palabra. */
function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-7"
    >
      <path d="M7 3v8a2 2 0 0 0 2 2v8" />
      <path d="M5 3v5M9 3v5" />
      <path d="M17 3c-1.5 1.5-2 3.5-2 5.5S15.5 12 17 12v9" />
    </svg>
  );
}
