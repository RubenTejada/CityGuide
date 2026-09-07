"use client";

import { useEffect, useRef, useState } from "react";

import { useWords } from "@/components/LocaleProvider";
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
 * Es un &lt;dialog&gt; modal: el navegador se encarga del foco y de cerrar con Escape, y
 * un clic en el fondo cierra también.
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
        <Dialog
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
        </Dialog>
      )}
    </>
  );
}

/** El modal en sí: cabecera con el título y el aspa, y debajo lo que le pasen. */
function Dialog({
  title,
  close,
  onClose,
  children,
}: {
  title: string;
  close: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      // Un clic en el fondo del modal llega al propio <dialog>, no a su contenido.
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
      aria-label={title}
      className="m-auto max-h-[85vh] w-[92vw] max-w-3xl overflow-hidden rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={close}
            className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </dialog>
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

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-5"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
