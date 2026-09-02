"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  MarkerClusterer,
  type Cluster,
  type Renderer,
} from "@googlemaps/markerclusterer";

/**
 * Clustering and hover framing shared by every map that draws a set of pins
 * beside a list of the same places: the listing/company map (`MarkersMap`) and
 * the neighbourhood map of a place's page (`PlaceMap`).
 */

/**
 * Cluster bubble: one branded circle carrying the number of pins it stands
 * for. Drawn as an AdvancedMarkerElement so clusters and pins are the same
 * kind of marker (the library's default renderer uses the legacy one).
 */
const clusterRenderer: Renderer = {
  render: ({ count, position }) => {
    const bubble = document.createElement("div");
    bubble.className =
      "flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-sm font-semibold text-white shadow-md";
    bubble.textContent = String(count);
    return new google.maps.marker.AdvancedMarkerElement({
      position,
      content: bubble,
      // Above the individual pins, and denser clusters above sparser ones.
      zIndex: 1000 + count,
    });
  },
};

/**
 * Collects the rendered pins as they mount, keyed by the id of the place each
 * one stands for. `refFor` hands out one ref callback per pin, cached so it
 * keeps its identity across renders: a fresh callback would be detached and
 * reattached on every render, and each of those writes state.
 */
export function useMarkerElements() {
  const [elements, setElements] = useState<
    Record<string, google.maps.marker.AdvancedMarkerElement>
  >({});

  const refFor = useMemo(() => {
    const cache: Record<
      string,
      (element: google.maps.marker.AdvancedMarkerElement | null) => void
    > = {};
    return (id: string) =>
      (cache[id] ??= (element) =>
        setElements((current) => {
          if (element) return { ...current, [id]: element };
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          return next;
        }));
  }, []);

  return { elements, refFor };
}

/**
 * Groups the rendered markers into clusters. Markers reach it as DOM elements
 * through refs — the clusterer owns their `map` assignment from then on.
 */
function useClusterer(
  markerElements: Record<string, google.maps.marker.AdvancedMarkerElement>,
) {
  const map = useMap();
  const markerLibrary = useMapsLibrary("marker");

  const clusterer = useMemo(
    () =>
      map && markerLibrary
        ? new MarkerClusterer({ map, renderer: clusterRenderer })
        : null,
    [map, markerLibrary],
  );

  useEffect(() => () => clusterer?.setMap(null), [clusterer]);

  useEffect(() => {
    if (!clusterer) return;
    clusterer.clearMarkers();
    clusterer.addMarkers(Object.values(markerElements));
  }, [clusterer, markerElements]);

  return clusterer;
}

/**
 * Bounds of the bubble a pin is hidden inside, or null when the pin is drawn
 * on its own. The clusterer keeps its groups to itself (`clusters` is
 * protected), so they are read back off the instance; a clustered pin is the
 * one the clusterer took off the map.
 */
function clusterBoundsHiding(
  clusterer: MarkerClusterer,
  element: google.maps.marker.AdvancedMarkerElement,
): google.maps.LatLngBounds | null {
  if (element.map) return null;
  const { clusters } = clusterer as unknown as { clusters?: Cluster[] };
  const cluster = clusters?.find((group) => group.markers?.includes(element));
  return cluster?.bounds ?? null;
}

/** Where a pin stands, whichever shape the marker stored it in. */
function markerPosition(
  element: google.maps.marker.AdvancedMarkerElement,
): google.maps.LatLngLiteral | null {
  const position = element.position;
  if (!position) return null;
  if (position instanceof google.maps.LatLng) return position.toJSON();
  const { lat, lng } = position as google.maps.LatLngLiteral;
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
}

/**
 * Whether the map shows the point comfortably: a pin sitting on the very edge
 * is drawn half outside the frame, so the outer tenth of the viewport counts
 * as off screen.
 */
function isFramed(map: google.maps.Map, point: google.maps.LatLngLiteral) {
  const bounds = map.getBounds();
  if (!bounds) return true;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const margin = 0.1;
  const lat = (ne.lat() - sw.lat()) * margin;
  const lng = (ne.lng() - sw.lng()) * margin;
  return (
    point.lat > sw.lat() + lat &&
    point.lat < ne.lat() - lat &&
    point.lng > sw.lng() + lng &&
    point.lng < ne.lng() - lng
  );
}

/**
 * Eases the camera to a centre and zoom. The Maps API only animates `panTo`
 * when the move is shorter than the viewport, and `moveCamera` never animates,
 * so a pin two sectors away would teleport; this tweens it frame by frame.
 * Returns a canceller, so hovering the next row takes the camera over instead
 * of fighting the previous move.
 */
function animateCamera(
  map: google.maps.Map,
  target: { center: google.maps.LatLngLiteral; zoom: number },
  duration = 500,
): () => void {
  const center = map.getCenter()?.toJSON();
  const zoom = map.getZoom();
  if (!center || zoom === undefined) {
    map.moveCamera(target);
    return () => {};
  }
  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    // ease-in-out: leaves and arrives slowly.
    const eased =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - (-2 * progress + 2) ** 2 / 2;
    map.moveCamera({
      center: {
        lat: center.lat + (target.center.lat - center.lat) * eased,
        lng: center.lng + (target.center.lng - center.lng) * eased,
      },
      zoom: zoom + (target.zoom - zoom) * eased,
    });
    if (progress < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

/**
 * Frames the pin the list points at: opens the cluster swallowing it — the
 * same zoom clicking the bubble performs — or, when the pin is drawn on its
 * own but sits outside the frame, flies the camera onto it. Hovering a row
 * after a cluster was opened is exactly that second case: the map is zoomed in
 * on another corner and the pin would otherwise highlight where nobody looks.
 * The camera goes back where the visitor had it once the pointer leaves the
 * list; hovering another row while still in the list frames that row instead,
 * and the framing to return to stays the one from before the first move.
 */
function useRevealHighlighted(
  clusterer: MarkerClusterer | null,
  elements: Record<string, google.maps.marker.AdvancedMarkerElement>,
  highlighted: string | null,
) {
  const map = useMap();
  const framing = useRef<{
    center: google.maps.LatLngLiteral;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    if (!map || !clusterer) return;

    const remember = () => {
      const center = map.getCenter()?.toJSON();
      const zoom = map.getZoom();
      if (!framing.current && center && zoom !== undefined) {
        framing.current = { center, zoom };
      }
    };

    const element = highlighted ? elements[highlighted] : undefined;
    if (element) {
      const bounds = clusterBoundsHiding(clusterer, element);
      if (bounds) {
        remember();
        map.fitBounds(bounds, 64);
        return;
      }
      const position = markerPosition(element);
      if (!position || isFramed(map, position)) return;
      remember();
      // Only the centre moves: the visitor keeps the zoom they are reading at.
      return animateCamera(map, { center: position, zoom: map.getZoom() ?? 13 });
    }

    if (framing.current) {
      const back = framing.current;
      framing.current = null;
      return animateCamera(map, back);
    }
  }, [map, clusterer, elements, highlighted]);
}

/**
 * Clusters the pins collected by `useMarkerElements` and frames the one the
 * list is pointing at. Call it inside the `<Map>`, where `useMap` resolves.
 */
export function useClusteredPins(
  elements: Record<string, google.maps.marker.AdvancedMarkerElement>,
  highlighted: string | null,
) {
  const clusterer = useClusterer(elements);
  useRevealHighlighted(clusterer, elements, highlighted);
}
