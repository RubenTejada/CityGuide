"use client";

import { useEffect, useRef } from "react";
import { ColorScheme, useMap } from "@vis.gl/react-google-maps";
import { useIsDark } from "@/lib/theme";

/**
 * The colour scheme a `<Map>` must be drawn in, following the page's own
 * theme: the tiles are painted by Google and no CSS of ours reaches them, so
 * the dark page needs the map told in its own terms.
 */
export function useMapColorScheme() {
  return useIsDark() ? ColorScheme.DARK : ColorScheme.LIGHT;
}

/**
 * Keeps the camera across the theme change. `colorScheme` cannot be changed
 * on a live map, so the library builds a new one — which would otherwise drop
 * the visitor back on the default centre and zoom, losing wherever they had
 * panned to. This saves the camera as the old instance goes and restores it
 * on the new one; the first instance has nothing saved and keeps its defaults.
 */
export function KeepCamera() {
  const map = useMap();
  const camera = useRef<{ center: google.maps.LatLngLiteral; zoom: number }>(
    null,
  );

  useEffect(() => {
    if (!map) return;
    const saved = camera.current;
    if (saved) map.moveCamera(saved);
    return () => {
      const center = map.getCenter()?.toJSON();
      const zoom = map.getZoom();
      if (center && zoom !== undefined) camera.current = { center, zoom };
    };
  }, [map]);

  return null;
}
