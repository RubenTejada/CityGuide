"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { useLocale, useWords } from "@/components/LocaleProvider";
import { INTL_LOCALE } from "@/lib/i18n";

/** Lo que el visor escribe. Lo pone quien lo abre, porque no es lo mismo pasar fotos
 *  de un lugar que pasar las páginas de su carta. Lo que es del propio visor — el
 *  zoom — lo lee él del diccionario, que acercar una foto y acercar una página es lo
 *  mismo. */
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

/** Hasta dónde se acerca una imagen y cuánto cambia cada paso de los botones. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.5;
/** A lo que salta un doble clic, o un doble toque, desde el tamaño original. */
const DOUBLE_TAP_ZOOM = 2.5;

/** Cómo se ve la imagen: su escala y cuánto se ha desplazado desde el centro, en px. */
type View = { scale: number; x: number; y: number };
const ORIGINAL: View = { scale: 1, x: 0, y: 0 };

type Point = { x: number; y: number };

/**
 * El visor de imágenes: una en grande dentro de un modal, con las demás en una tira
 * debajo para saltar a cualquiera y una flecha a cada lado para pasarlas. Es un
 * &lt;dialog&gt; modal, así el navegador se encarga del foco y de cerrar con Escape; un
 * clic en el fondo cierra también.
 *
 * La imagen se acerca y se aleja — la letra de una carta fotografiada no se lee a
 * pantalla completa —: con los botones de la cabecera y las teclas + - 0, con la rueda
 * o el gesto del trackpad, con dos dedos en el teléfono y con un doble clic o doble
 * toque, que acerca sobre el punto tocado y vuelve al tamaño original. Acercada, se
 * arrastra para recorrerla y no sale del marco; al pasar a otra imagen vuelve a su
 * tamaño.
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
  const words = useWords().place;
  const percent = new Intl.NumberFormat(INTL_LOCALE[useLocale()], {
    style: "percent",
  });
  const dialog = useRef<HTMLDialogElement>(null);
  /** El marco en que la imagen se mueve: lo que el dedo o el ratón tocan. */
  const stage = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [view, setView] = useState<View>(ORIGINAL);
  /** Los punteros apoyados ahora mismo, por id: uno arrastra, dos pellizcan. */
  const pointers = useRef(new Map<number, Point>());
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  /** Pasa a otra imagen, que llega a su tamaño original. */
  const show = useCallback((i: number) => {
    setIndex(i);
    setView(ORIGINAL);
  }, []);

  const go = useCallback(
    (step: number) => show((index + step + images.length) % images.length),
    [show, index, images.length],
  );

  /** Multiplica la escala por `factor` dejando quieto el punto `at` — en px desde el
   *  centro del marco —, o el centro si no hay punto: lo que está bajo el cursor sigue
   *  bajo el cursor. */
  const zoomBy = useCallback((factor: number, at: Point = { x: 0, y: 0 }) => {
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = scale / v.scale;
      return fit(
        { scale, x: at.x - ratio * (at.x - v.x), y: at.y - ratio * (at.y - v.y) },
        stage.current,
      );
    });
  }, []);

  const pan = useCallback((dx: number, dy: number) => {
    setView((v) => fit({ ...v, x: v.x + dx, y: v.y + dy }, stage.current));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "+" || event.key === "=") zoomBy(ZOOM_STEP);
      if (event.key === "-") zoomBy(1 / ZOOM_STEP);
      if (event.key === "0") setView(ORIGINAL);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, zoomBy]);

  // La rueda acerca hacia donde apunta el cursor. React registra `wheel` como pasivo,
  // así que se escucha a mano para poder impedir que la página de detrás se desplace.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Firefox cuenta la rueda del ratón en líneas, no en píxeles.
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomBy(Math.exp(-delta * 0.002), fromCenter(element, event));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = pointers.current;
    const previous = active.get(event.pointerId);
    if (!previous) return;
    const [a, b] = [...active.values()];
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (active.size === 2) {
      // Pellizco: la escala sigue a la distancia entre los dedos, y el desplazamiento
      // al punto medio, para que también se pueda recorrer con los dos apoyados.
      const [a2, b2] = [...active.values()];
      const before = midpoint(a, b);
      const after = midpoint(a2, b2);
      if (distance(a, b) > 0) {
        zoomBy(distance(a2, b2) / distance(a, b), fromCenter(event.currentTarget, after));
      }
      pan(after.x - before.x, after.y - before.y);
      return;
    }
    pan(event.clientX - previous.x, event.clientY - previous.y);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) setDragging(false);
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (view.scale > MIN_ZOOM) setView(ORIGINAL);
    else zoomBy(DOUBLE_TAP_ZOOM, fromCenter(event.currentTarget, event));
  };

  const zoomed = view.scale > MIN_ZOOM;

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
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2 text-sm text-white">
          <span>{labels.count(index + 1, images.length)}</span>
          <div className="flex items-center gap-1">
            <IconButton
              label={words.viewerZoomOut}
              disabled={view.scale <= MIN_ZOOM}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              <MinusIcon />
            </IconButton>
            <button
              type="button"
              onClick={() => setView(ORIGINAL)}
              aria-label={words.viewerZoomReset}
              className="min-w-14 rounded-full px-2 py-1 text-xs tabular-nums hover:bg-white/20"
            >
              {percent.format(view.scale)}
            </button>
            <IconButton
              label={words.viewerZoomIn}
              disabled={view.scale >= MAX_ZOOM}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              <PlusIcon />
            </IconButton>
          </div>
          <IconButton
            label={labels.close}
            onClick={() => dialog.current?.close()}
            className="justify-self-end"
          >
            <CloseIcon />
          </IconButton>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={stage}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
            className={`absolute inset-0 touch-none overflow-hidden select-none ${
              zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
            }`}
          >
            <div
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              }}
              className={`absolute inset-0 ${
                dragging ? "" : "motion-safe:transition-transform motion-safe:duration-200"
              }`}
            >
              <Image
                key={images[index]}
                src={images[index]}
                alt={name}
                fill
                sizes="(min-width: 1024px) 64rem, 92vw"
                className="gallery-enter object-contain"
                draggable={false}
                priority
              />
            </div>
          </div>
          <Arrow side="left" label={labels.previous} onClick={() => go(-1)} />
          <Arrow side="right" label={labels.next} onClick={() => go(1)} />
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {images.map((image, i) => (
            <button
              key={image}
              type="button"
              onClick={() => show(i)}
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** La vista sin salirse del marco: acercada, la imagen puede desplazarse hasta que su
 *  borde llegue al del marco y no más allá, y al tamaño original no se mueve. */
function fit(view: View, stage: HTMLElement | null): View {
  const reachX = ((view.scale - 1) * (stage?.clientWidth ?? 0)) / 2;
  const reachY = ((view.scale - 1) * (stage?.clientHeight ?? 0)) / 2;
  return {
    scale: view.scale,
    x: clamp(view.x, -reachX, reachX),
    y: clamp(view.y, -reachY, reachY),
  };
}

/** Un punto de la pantalla medido desde el centro del marco, que es donde la
 *  transformación tiene su origen. */
function fromCenter(
  stage: HTMLElement,
  point: { clientX: number; clientY: number } | Point,
): Point {
  const rect = stage.getBoundingClientRect();
  const x = "clientX" in point ? point.clientX : point.x;
  const y = "clientY" in point ? point.clientY : point.y;
  return { x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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

/** Un botón de la cabecera: solo un icono, con su nombre para el lector de pantalla. */
function IconButton({
  label,
  onClick,
  disabled,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`rounded-full p-2 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-transparent ${className}`}
    >
      {children}
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

function PlusIcon() {
  return (
    <svg {...ICON} className="size-5">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg {...ICON} className="size-5">
      <path d="M5 12h14" />
    </svg>
  );
}
