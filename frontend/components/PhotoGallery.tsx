"use client";

import { type CSSProperties, useEffect, useState } from "react";

import ImageViewer from "@/components/ImageViewer";
import PhotoFit, { photoBoxAspect } from "@/components/PhotoFit";
import { type Photo } from "@/lib/umbraco";
import { useWords } from "@/components/LocaleProvider";

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
  // La principal no puede cambiar de forma en cada vuelta —la página daría un salto
  // cada siete segundos—, así que toma la forma de la foto que mejor representa a la
  // tanda: la mediana de todas. Las que se salgan de ahí las resuelve `PhotoFit`.
  const mainBox = medianBox(photos);
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
          box={mainBox}
          sizes="(min-width: 1024px) 26rem, 100vw"
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
              // La tira lleva la misma forma que la principal: son las mismas fotos,
              // y una tira cuadrada sobre una tanda de verticales las enseñaba a
              // todas con banda.
              box={mainBox}
              sizes="(min-width: 1024px) 9rem, 33vw"
              // La marca de la tira se apaga y se enciende con el mismo fundido que
              // la principal, o el salto de la tira delata el cambio antes de tiempo.
              className={`transition-opacity ${
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
 * La forma que mejor representa a una tanda de fotos: la mediana de sus
 * proporciones, acotada a lo que el portal dibuja. Una tanda sin ningún tamaño
 * conocido se queda con el 11/8 de siempre — un 16/9 subido un 30%, que es lo que
 * deja a la principal mandar sobre la tira que lleva debajo.
 */
function medianBox(photos: Photo[]): number {
  const boxes = photos
    .map((photo) => photoBoxAspect(photo))
    .filter((box): box is number => box !== null)
    .sort((a, b) => a - b);
  return boxes.length === 0 ? 11 / 8 : boxes[Math.floor(boxes.length / 2)];
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
  box,
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
  /** La proporción de la celda: la tira es cuadrada, la principal la de la tanda. */
  box: number;
  sizes: string;
  className?: string;
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
      className={`group relative block w-full cursor-zoom-in overflow-hidden bg-neutral-200 ${className ?? ""}`}
      style={
        {
          aspectRatio: box,
          ...style,
          ...(fade ? { "--gallery-fade": `${fade}ms` } : {}),
        } as CSSProperties
      }
    >
      {fading && (
        <PhotoFit
          src={previous.url}
          alt=""
          width={previous.width}
          height={previous.height}
          box={box}
          sizes={sizes}
        />
      )}
      <PhotoFit
        key={photo.url}
        src={photo.url}
        alt={name}
        width={photo.width}
        height={photo.height}
        box={box}
        sizes={sizes}
        className={`transition-transform duration-300 group-hover:scale-105 ${
          fading ? "gallery-enter" : ""
        }`}
      />
    </button>
  );
}
