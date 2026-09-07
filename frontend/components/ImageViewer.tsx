"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Lo que el visor escribe. Lo pone quien lo abre, porque no es lo mismo pasar fotos
 *  de un lugar que pasar las páginas de su carta. */
export type ViewerLabels = {
  /** Nombre del propio modal. */
  title: string;
  /** "3 de 7". */
  count: (n: number, total: number) => string;
  /** Cada miniatura, para quien navega con lector de pantalla. */
  open: (n: number, total: number) => string;
  previous: string;
  next: string;
  close: string;
};

/**
 * El visor de imágenes: una en grande dentro de un modal, con las demás en una tira
 * debajo para saltar a cualquiera y una flecha a cada lado para pasarlas. Es un
 * &lt;dialog&gt; modal, así el navegador se encarga del foco y de cerrar con Escape; un
 * clic en el fondo cierra también.
 *
 * Lo comparten la galería de fotos y el menú: son las mismas imágenes en grande, y una
 * segunda copia de esto solo serviría para que las dos se separaran. Lo único que las
 * distingue es la nota al pie, que el menú lleva y la galería no.
 */
export default function ImageViewer({
  images,
  name,
  start,
  labels,
  note,
  onClose,
}: {
  images: string[];
  name: string;
  start: number;
  labels: ViewerLabels;
  /** Lo que haya que decir de estas imágenes con ellas delante: de dónde salió un
   *  menú, cuándo se capturó y que los precios pueden haber cambiado. */
  note?: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(start);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const go = useCallback(
    (step: number) => setIndex((i) => (i + step + images.length) % images.length),
    [images.length],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      // Un clic en el fondo del modal llega al propio <dialog>, no a su contenido.
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
      aria-label={labels.title}
      className="m-auto h-[85vh] w-[92vw] max-w-5xl overflow-hidden rounded-2xl bg-neutral-900 p-0 shadow-2xl backdrop:bg-black/80"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3 text-sm text-white">
          <span>{labels.count(index + 1, images.length)}</span>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={labels.close}
            className="rounded-full p-2 hover:bg-white/20"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <Image
            key={images[index]}
            src={images[index]}
            alt={name}
            fill
            sizes="(min-width: 1024px) 64rem, 92vw"
            className="gallery-enter object-contain"
            priority
          />
          <Arrow side="left" label={labels.previous} onClick={() => go(-1)} />
          <Arrow side="right" label={labels.next} onClick={() => go(1)} />
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {images.map((image, i) => (
            <button
              key={image}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={labels.open(i + 1, images.length)}
              aria-current={i === index}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded ${
                i === index
                  ? "ring-2 ring-white"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <Image
                src={image}
                alt=""
                fill
                sizes="6rem"
                className="object-cover"
              />
            </button>
          ))}
        </div>

        {note && (
          <div className="border-t border-white/15 px-4 py-3 text-white/70">
            {note}
          </div>
        )}
      </div>
    </dialog>
  );
}

/** Una de las dos flechas del visor: redonda, clara y del tamaño de un dedo. */
function Arrow({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 text-neutral-900 shadow-lg transition hover:bg-white ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      <Chevron flipped={side === "right"} />
    </button>
  );
}

const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** La punta de flecha del visor; a la derecha va la misma, girada. */
function Chevron({ flipped }: { flipped: boolean }) {
  return (
    <svg {...ICON} className={`size-6 ${flipped ? "rotate-180" : ""}`}>
      <path d="M15 4 7 12l8 8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON} className="size-5">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
