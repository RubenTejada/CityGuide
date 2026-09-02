"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { RatingBadge } from "./Rating";

/**
 * A map and the list of the places it pins, drawn as one block: shared border,
 * the list scrolling inside the map's height, and one exit for the hover
 * framing. Both maps that pair a list with pins use it — the neighbourhood
 * panel of a place's page (`PlaceMap`, "¿Qué está cerca?") and the listing,
 * events and attractions map (`MarkersMap`, "Cerca de ti").
 *
 * The framing a row asks for (`mapPins`) is only given back when the pointer
 * leaves the whole block, so travelling from a row onto the pin it just framed
 * keeps that pin in view instead of undoing the move.
 */
export default function MapBlock({
  side,
  onExit,
  heightClass,
  children,
}: {
  /** The list column. Omitted, the block is the map alone. */
  side?: ReactNode;
  /** Clears whatever the list was pointing at: the pointer or the focus left. */
  onExit?: () => void;
  /** Height of the map column — it is what sets the block's height. */
  heightClass: string;
  /** The map itself, plus anything drawn over it. */
  children: ReactNode;
}) {
  return (
    <div
      className={`grid overflow-hidden rounded-xl border border-neutral-200 bg-white ${
        side ? "lg:grid-cols-[20rem_1fr]" : ""
      }`}
      onMouseLeave={onExit}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onExit?.();
        }
      }}
    >
      {side && (
        <aside className="relative order-2 border-t border-neutral-200 lg:order-1 lg:border-r lg:border-t-0">
          {/* Taken out of the flow beside the map, so the block is as tall as
              the map and the list scrolls inside it instead of stretching it.
              Stacked, the list keeps its own capped height. */}
          <div className="flex flex-col lg:absolute lg:inset-0">{side}</div>
        </aside>
      )}
      <div
        className={`relative order-1 overflow-hidden lg:order-2 ${heightClass}`}
      >
        {children}
      </div>
    </div>
  );
}

/** Title row of the list column; anything passed sits beside the title. */
export function MapPanelHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
      <h3 className="whitespace-nowrap font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** The list itself: scrolls inside the block instead of growing past the map. */
export function MapPanelList({ children }: { children: ReactNode }) {
  return (
    <ul className="max-h-80 min-h-0 flex-1 divide-y divide-neutral-200 overflow-y-auto lg:max-h-none">
      {children}
    </ul>
  );
}

/** Empty state of the list column. */
export function MapPanelEmpty({ children }: { children: ReactNode }) {
  return <li className="p-3 text-sm text-neutral-500">{children}</li>;
}

/**
 * One place in the list: pointing at it frames its pin. Leaving the row never
 * clears that — only leaving the block does, which is what lets the pointer
 * travel onto the map.
 */
export function MapPanelRow({
  href,
  name,
  rating,
  ratingCount,
  detail,
  onPoint,
}: {
  href: string;
  name: string;
  rating?: number | null;
  ratingCount?: number | null;
  /** Second line: the distance, and the category when the list mixes them. */
  detail: ReactNode;
  onPoint: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block p-3 text-sm hover:bg-neutral-50"
        onMouseEnter={onPoint}
        onFocus={onPoint}
      >
        <span className="font-medium">{name}</span>
        <RatingBadge
          value={rating}
          count={ratingCount}
          className="ml-2 !text-xs"
        />
        <span className="mt-0.5 block text-xs text-neutral-500">{detail}</span>
      </Link>
    </li>
  );
}
