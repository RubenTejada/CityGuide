"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type Locale } from "@/lib/i18n";
import { EventCard, type EventEntry } from "./EventsList";

/** How many cards the window holds. */
const VISIBLE = 3;
/** How long a set of three stands still before the next one climbs in. */
const HOLD_MS = 4000;
/** How long that climb takes. */
const SLIDE_MS = 700;
const SLIDE = `transform ${SLIDE_MS}ms ease-in-out`;
/** The smallest space between cards, which the step from one to the next counts in. */
const GAP = 16;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** Tailwind's `lg:`, where the events column stands beside the sections grid and
 *  is given a height to fill. Stacked under it there is no bottom to meet. */
const BESIDE_SECTIONS = "(min-width: 1024px)";

/**
 * A layout effect measures before the browser paints, which is what keeps the
 * whole list from flashing unclipped; on the server there is no layout to read.
 */
const useMeasure = typeof window === "undefined" ? useEffect : useLayoutEffect;

function watchMedia(query: string) {
  return (onChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  };
}

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    watchMedia(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The home page's "Próximos eventos": more events than fit, three of them on
 * screen, and every four seconds the top one climbs out and the next one takes
 * the bottom slot. It comes back to the first without rewinding — the three
 * cards after the last one are the first three again, and the jump back to the
 * top is made with the animation off, on a view identical to the one on screen.
 *
 * Two things are measured rather than assumed. The tallest card decides the
 * height of every slot, so the window never lands between two cards; and beside
 * the sections grid the space left in the column decides how far apart the three
 * of them sit, so the block ends level with the grid instead of short of it.
 *
 * It stands still while the pointer is over it or something inside it has
 * focus, and a visitor who asked for less movement gets the plain list instead —
 * stopping the rotation there would leave the rest of the events unreachable.
 */
export default function EventTicker({
  events,
  locale,
}: {
  events: EventEntry[];
  locale: Locale;
}) {
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<{
    card: number;
    gap: number;
    height: number;
  } | null>(null);
  const [paused, setPaused] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);

  const reducedMotion = useMedia(REDUCED_MOTION);
  const fillsColumn = useMedia(BESIDE_SECTIONS);
  const rotates = events.length > VISIBLE && !reducedMotion;
  const total = events.length;

  useMeasure(() => {
    if (!rotates) return;
    const host = frame.current?.parentElement;
    if (!host) return;
    const measure = () => {
      const nodes = cards.current.filter((node) => node !== null);
      if (nodes.length === 0) return;
      // The card inside a slot keeps its natural height, so measuring it again
      // never reads back the height the slot was just given.
      const card = Math.max(
        ...nodes.map((node) => node.getBoundingClientRect().height),
      );
      // The column's own height is set by the sections grid beside it — never by
      // this window, which is out of the flow there — so what is left over goes
      // between the cards rather than inside them. A column too short for three
      // of them keeps the plain gap and shows what fits, rather than growing
      // past the bottom of the page's row.
      const room = fillsColumn ? host.clientHeight : 0;
      const gap = Math.max(GAP, (room - VISIBLE * card) / (VISIBLE - 1));
      const height = room > 0 ? room : VISIBLE * card + (VISIBLE - 1) * gap;
      // Sizing the window changes the box the observer watches, so an unchanged
      // measurement must not become new state: the rotation's timer restarts
      // with it.
      setLayout((known) =>
        known &&
        known.card === card &&
        known.gap === gap &&
        known.height === height
          ? known
          : { card, gap, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    for (const node of cards.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [rotates, fillsColumn, total]);

  useEffect(() => {
    if (!rotates || paused || layout === null) return;
    if (index === total) {
      // The window is showing the copies of the first three cards, which is the
      // view index 0 draws: going back to it is a jump nobody can see, as long
      // as it is not animated. Writing the style by hand and forcing the layout
      // to settle is what guarantees that — leaving it to the next render would
      // let the browser animate the whole track back up.
      const id = setTimeout(() => {
        const node = track.current;
        if (node) {
          node.style.transition = "none";
          node.style.transform = "translateY(0px)";
          node.getBoundingClientRect();
          // Back to what the next render believes is already there: React
          // rewrites a style property only when its own value changed, so a
          // transition left switched off here would never come back on.
          node.style.transition = SLIDE;
        }
        setIndex(0);
      }, SLIDE_MS);
      return () => clearTimeout(id);
    }
    // The wait starts when the slide does, so what the visitor sees is four
    // seconds of stillness.
    const id = setTimeout(() => setIndex((i) => i + 1), HOLD_MS + SLIDE_MS);
    return () => clearTimeout(id);
  }, [rotates, paused, layout, index, total]);

  // Before the measurement — and without JavaScript — the list is whole and the
  // window does not clip it.
  const slots =
    rotates && layout !== null
      ? [...events, ...events.slice(0, VISIBLE)]
      : events;
  const step = layout === null ? 0 : layout.card + layout.gap;

  return (
    <div
      ref={frame}
      className="overflow-hidden"
      style={layout === null ? undefined : { height: layout.height }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <ul
        ref={track}
        className="grid"
        style={{
          gap: layout === null ? GAP : layout.gap,
          transform:
            layout === null ? undefined : `translateY(${-index * step}px)`,
          transition: layout === null ? undefined : SLIDE,
        }}
      >
        {slots.map((event, i) => (
          <li
            key={`${event.id}-${i}`}
            // The copies at the end only fill the window during the jump back:
            // they are out of the tab order and out of the accessibility tree.
            inert={i >= total}
            style={layout === null ? undefined : { height: layout.card }}
          >
            <div
              className="grid"
              ref={(node) => {
                cards.current[i] = node;
              }}
            >
              <EventCard event={event} locale={locale} compact />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
