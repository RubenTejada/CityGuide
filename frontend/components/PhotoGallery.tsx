"use client";

import Image from "next/image";
import { type CSSProperties, useEffect, useState } from "react";

import ImageViewer from "@/components/ImageViewer";
import { useWords } from "@/components/LocaleProvider";
import { focalPosition, type Photo } from "@/lib/umbraco";

/** Cada cuánto sube a la foto principal la siguiente de la tira. Tiene que dejar la
 *  foto quieta un rato después del fundido, o la galería no para de moverse. */
const INTERVAL_MS = 7000;
/** Lo que tarda el fundido de la principal (`gallery-enter` en globals.css). */
const FADE_MS = 2400;
/** Con siete fotos o más la tira de abajo es de seis; con menos, de tres. Siete es lo
 *  que baja el agente: las seis de la tira y una más que solo se ve en el visor. */
const WIDE_FROM = 7;

/**
 * La galería de un lugar: una foto principal y, pegada debajo, una tira de tres o seis,
 * todo un rectángulo con 4px de junta entre fotos. La tira no se mueve; lo que rota es la
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
  photos: Photo[];
  name: string;
  label: string;
}) {
  const words = useWords();
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
        // La junta de 4px la pinta el fondo del propio bloque, que en oscuro se
        // oscurece con el resto de las superficies claras.
        className="flex flex-col gap-1 overflow-hidden rounded-xl bg-neutral-200"
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
          fade={FADE_MS}
          onOpen={setViewing}
        />
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: tiles }, (_, tile) => (
            <Cell
              key={tile}
              index={tile}
              previous={null}
              photos={photos}
              name={name}
              sizes="(min-width: 1024px) 9rem, 33vw"
              // La marca de la tira se apaga y se enciende con el mismo fundido que
              // la principal, o el salto de la tira delata el cambio antes de tiempo.
              className={`aspect-square transition-opacity ${
                tile === active ? "" : "opacity-70"
              }`}
              style={{ transitionDuration: `${FADE_MS}ms` }}
              onOpen={setViewing}
            />
          ))}
        </div>
      </div>

      {viewing !== null && (
        <ImageViewer
          images={photos.map((photo) => photo.url)}
          name={name}
          start={viewing}
          labels={{
            title: words.place.gallery,
            count: words.place.galleryCount,
            open: words.place.galleryOpen,
            previous: words.place.galleryPrevious,
            next: words.place.galleryNext,
            close: words.place.galleryClose,
          }}
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
  style,
  fade,
  onOpen,
}: {
  index: number;
  previous: Photo | null;
  photos: Photo[];
  name: string;
  sizes: string;
  className: string;
  style?: CSSProperties;
  fade?: number;
  onOpen: (index: number) => void;
}) {
  const words = useWords();
  const photo = photos[index];
  const fading = previous !== null && previous.url !== photo.url;
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={words.place.galleryOpen(index + 1, photos.length)}
      className={`group relative block w-full cursor-zoom-in overflow-hidden bg-neutral-200 ${className}`}
      style={
        fade
          ? ({ ...style, "--gallery-fade": `${fade}ms` } as CSSProperties)
          : style
      }
    >
      {fading && (
        <Image
          src={previous.url}
          alt=""
          fill
          sizes={sizes}
          className="object-cover"
          style={{ objectPosition: focalPosition(previous) }}
          aria-hidden
        />
      )}
      <Image
        key={photo.url}
        src={photo.url}
        alt={name}
        fill
        sizes={sizes}
        className={`object-cover transition-transform duration-300 group-hover:scale-105 ${
          fading ? "gallery-enter" : ""
        }`}
        style={{ objectPosition: focalPosition(photo) }}
      />
    </button>
  );
}
