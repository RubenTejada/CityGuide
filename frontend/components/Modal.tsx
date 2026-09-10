"use client";

import { useEffect, useRef } from "react";

/**
 * El modal del portal: cabecera con el título y el aspa, y debajo lo que le pasen.
 *
 * Es un &lt;dialog&gt; modal, así que el navegador se encarga del foco y de cerrar con
 * Escape, y un clic en el fondo cierra también. Lo comparten la carta de un restaurante
 * y su formulario de reserva: son la misma ventana, y dos copias solo se separarían.
 */
export default function Modal({
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
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
