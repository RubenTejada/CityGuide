"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWords } from "@/components/LocaleProvider";

/** Cada cuánto sube a la foto principal la siguiente de la tira. */
const INTERVAL_MS = 4500;
/** Con nueve fotos o más la tira de abajo es de seis; con menos, de tres. */
const WIDE_FROM = 9;

/**
 * La galería de un lugar: una foto principal y, pegada debajo, una tira de tres o seis,
 * todo un rectángulo sin junta entre fotos. La tira no se mueve; lo que rota es la
 * principal, que va subiendo una tras otra las fotos de abajo — la que está arriba queda
 * marcada en la tira — fundiéndose despacio sobre la que sustituye.
 *
 * Cualquier foto abre el visor, que es donde se ven todas en grande, la tira incluida y
 * las que no caben en ella.
 *
 * El ancho lo pone quien la coloca: en la ficha de un lugar ocupa media columna.
 *
 * Se detiene mientras el puntero está encima o el visor está abierto, y no rota si el
 * visitante pidió menos movimiento.
 */
export default function PhotoGallery({
  photos,
  name,
  label,
}: {
  photos: string[];
  name: string;
  label: string;
}) {
  const tiles = photos.length >= WIDE_FROM ? 6 : 3;
  // Cuenta de vueltas, no posición: el primer render no tiene foto saliente y así se
  // distingue de la vuelta completa, sin guardar el valor anterior en un ref.
  const [turn, setTurn] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const active = turn % tiles;

  useEffect(() => {
    if (paused || viewing !== null || tiles < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTurn((t) => t + 1), INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, viewing, tiles]);

  // Menos fotos que celdas no es una galería: la página se queda con su foto sola.
  if (photos.length < tiles) return null;

  return (
    <>
      <div
        role="group"
        aria-label={label}
        className="overflow-hidden rounded-xl bg-neutral-200"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <Cell
          index={active}
          previous={turn === 0 ? null : photos[(turn - 1) % tiles]}
          photos={photos}
          name={name}
          sizes="(min-width: 1024px) 26rem, 100vw"
          // Un 16/9 subido un 30%: la principal manda sobre la tira que lleva debajo.
          className="aspect-11/8"
          onOpen={setViewing}
        />
        <div className="grid grid-cols-3">
          {Array.from({ length: tiles }, (_, tile) => (
            <Cell
              key={tile}
              index={tile}
              previous={null}
              photos={photos}
              name={name}
              sizes="(min-width: 1024px) 9rem, 33vw"
              className={`aspect-square transition-opacity duration-500 ${
                tile === active ? "" : "opacity-70"
              }`}
              onOpen={setViewing}
            />
          ))}
        </div>
      </div>

      {viewing !== null && (
        <Lightbox
          photos={photos}
          name={name}
          start={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

/**
 * Una celda de la galería. La principal cambia de foto: la nueva se funde sobre la
 * anterior, que se queda debajo hasta que el fundido termina — de ahí que la clave por
 * URL rearranque la animación en cada cambio. Es un botón porque cualquier foto abre el
 * visor.
 */
function Cell({
  index,
  previous,
  photos,
  name,
  sizes,
  className,
  onOpen,
}: {
  index: number;
  previous: string | null;
  photos: string[];
  name: string;
  sizes: string;
  className: string;
  onOpen: (index: number) => void;
}) {
  const words = useWords();
  const url = photos[index];
  const fading = previous !== null && previous !== url;
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={words.place.galleryOpen(index + 1, photos.length)}
      className={`group relative block w-full cursor-zoom-in overflow-hidden bg-neutral-200 ${className}`}
    >
      {fading && (
        <Image
          src={previous}
          alt=""
          fill
          sizes={sizes}
          className="object-cover"
          aria-hidden
        />
      )}
      <Image
        key={url}
        src={url}
        alt={name}
        fill
        sizes={sizes}
        className={`object-cover transition-transform duration-300 group-hover:scale-105 ${
          fading ? "gallery-enter" : ""
        }`}
      />
    </button>
  );
}

/**
 * El visor: la foto en grande dentro de un modal, con las demás en una tira debajo para
 * saltar a cualquiera y una flecha a cada lado para pasarlas. Es un &lt;dialog&gt; modal,
 * así el navegador se encarga del foco y de cerrar con Escape; un clic en el fondo cierra
 * también.
 */
function Lightbox({
  photos,
  name,
  start,
  onClose,
}: {
  photos: string[];
  name: string;
  start: number;
  onClose: () => void;
}) {
  const words = useWords();
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(start);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const go = useCallback(
    (step: number) => setIndex((i) => (i + step + photos.length) % photos.length),
    [photos.length],
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
      aria-label={words.place.gallery}
      className="m-auto h-[85vh] w-[92vw] max-w-5xl overflow-hidden rounded-2xl bg-neutral-900 p-0 shadow-2xl backdrop:bg-black/80"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3 text-sm text-white">
          <span>{words.place.galleryCount(index + 1, photos.length)}</span>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={words.place.galleryClose}
            className="rounded-full p-2 hover:bg-white/20"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <Image
            key={photos[index]}
            src={photos[index]}
            alt={name}
            fill
            sizes="(min-width: 1024px) 64rem, 92vw"
            className="gallery-enter object-contain"
            priority
          />
          <Arrow
            side="left"
            label={words.place.galleryPrevious}
            onClick={() => go(-1)}
          />
          <Arrow
            side="right"
            label={words.place.galleryNext}
            onClick={() => go(1)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {photos.map((photo, i) => (
            <button
              key={photo}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={words.place.galleryOpen(i + 1, photos.length)}
              aria-current={i === index}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded ${
                i === index
                  ? "ring-2 ring-white"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <Image
                src={photo}
                alt=""
                fill
                sizes="6rem"
                className="object-cover"
              />
            </button>
          ))}
        </div>
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
