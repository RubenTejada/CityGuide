"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map,
  Pin,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Renderer } from "@googlemaps/markerclusterer";
import LogoPin from "./LogoPin";
import MapPopupCard from "./MapPopupCard";
import { RatingBadge } from "./Rating";
import { mapPinIcon } from "@/lib/sections";

export interface MapMarker {
  id: string;
  name: string;
  url: string;
  address: string | null;
  latitude: number;
  longitude: number;
  /** Company logo, drawn inside the map pin. */
  logo: string | null;
  /** Real photo — popup card only; omitted, the card shows the pin icon. */
  photo?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** How many nearby places the "cerca de ti" panel lists. */
const NEARBY_SHOWN = 8;

/** Great-circle distance in metres. */
function metersBetween(
  a: google.maps.LatLngLiteral,
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.lat);
  const dLng = toRad(b.longitude - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

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
}

/**
 * Frames the map: on the visitor's position once they share it, otherwise on
 * every marker.
 */
function FitViewport({
  markers,
  position,
}: {
  markers: MapMarker[];
  position: google.maps.LatLngLiteral | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (position) {
      map.setCenter(position);
      map.setZoom(14);
      return;
    }
    if (markers.length === 0) return;
    if (markers.length === 1) {
      map.setCenter({ lat: markers[0].latitude, lng: markers[0].longitude });
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    markers.forEach((m) => bounds.extend({ lat: m.latitude, lng: m.longitude }));
    map.fitBounds(bounds, 48);
  }, [map, markers, position]);
  return null;
}

/**
 * Map of any set of located content — company branches, malls in a listing,
 * attractions, cinemas showing a film. Pins are clustered, and with `locate`
 * the visitor can share their position to get the same places ranked by how
 * close they are.
 */
export default function MarkersMap({
  markers,
  locate = false,
  heightClass = "h-72 lg:h-96",
}: {
  markers: MapMarker[];
  /** Offer the "use my location" button and the nearby panel. */
  locate?: boolean;
  heightClass?: string;
}) {
  const [position, setPosition] = useState<google.maps.LatLngLiteral | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const askForLocation = () => {
    if (!navigator.geolocation) {
      setLocateError("Tu navegador no comparte la ubicación.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (found) => {
        setPosition({
          lat: found.coords.latitude,
          lng: found.coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setLocateError("No pudimos obtener tu ubicación.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const nearby = useMemo(() => {
    if (!position) return [];
    return markers
      .map((marker) => ({
        marker,
        meters: metersBetween(position, marker),
      }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, NEARBY_SHOWN);
  }, [markers, position]);

  if (!MAPS_KEY) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500">
        Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.
      </div>
    );
  }

  return (
    <div className={position ? "grid gap-4 lg:grid-cols-[16rem_1fr]" : ""}>
      {position && (
        <aside className="order-2 lg:order-1">
          <h3 className="font-semibold">Cerca de ti</h3>
          <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {nearby.length === 0 && (
              <li className="p-3 text-sm text-neutral-500">Nada cerca por ahora.</li>
            )}
            {nearby.map(({ marker, meters }) => (
              <li key={marker.id}>
                <Link
                  href={marker.url}
                  className="block p-3 text-sm hover:bg-neutral-50"
                >
                  <span className="font-medium">{marker.name}</span>
                  <RatingBadge
                    value={marker.rating}
                    count={marker.ratingCount}
                    className="ml-2 !text-xs"
                  />
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    {formatDistance(meters)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div
        className={`relative order-1 overflow-hidden rounded-xl lg:order-2 ${heightClass}`}
      >
        <APIProvider apiKey={MAPS_KEY}>
          <Map
            defaultCenter={
              markers.length > 0
                ? { lat: markers[0].latitude, lng: markers[0].longitude }
                : { lat: 18.4861, lng: -69.9312 }
            }
            defaultZoom={13}
            mapId="cityguide"
            gestureHandling="cooperative"
          >
            <FitViewport markers={markers} position={position} />
            <ClusteredMarkers markers={markers} />
            {position && (
              <AdvancedMarker position={position} title="Tu ubicación" zIndex={2000}>
                <Pin background="#2563eb" borderColor="#1d4ed8" glyphColor="#fff" />
              </AdvancedMarker>
            )}
          </Map>
        </APIProvider>

        {locate && (
          <div className="absolute left-3 top-3 z-10 max-w-56">
            <button
              type="button"
              onClick={askForLocation}
              disabled={locating}
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-md transition hover:border-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:text-neutral-400"
            >
              {locating
                ? "Buscando tu ubicación…"
                : position
                  ? "Actualizar mi ubicación"
                  : "Usar mi ubicación"}
            </button>
            {locateError && (
              <p className="mt-2 rounded-lg bg-white/95 px-3 py-2 text-xs text-neutral-600 shadow">
                {locateError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The pins themselves, handed to the clusterer as they mount. */
function ClusteredMarkers({ markers }: { markers: MapMarker[] }) {
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [elements, setElements] = useState<
    Record<string, google.maps.marker.AdvancedMarkerElement>
  >({});

  useClusterer(elements);

  // One ref callback per pin, cached so it keeps its identity across renders:
  // a fresh callback would be detached and reattached on every render, and
  // each of those writes state.
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

  return (
    <>
      {markers.map((marker) => (
        <AdvancedMarker
          key={marker.id}
          ref={refFor(marker.id)}
          position={{ lat: marker.latitude, lng: marker.longitude }}
          title={marker.name}
          onClick={() => setSelected(marker)}
        >
          <LogoPin
            logo={mapPinIcon(marker.url, marker.logo)}
            name={marker.name}
          />
        </AdvancedMarker>
      ))}
      {selected && (
        <InfoWindow
          position={{ lat: selected.latitude, lng: selected.longitude }}
          onCloseClick={() => setSelected(null)}
        >
          <MapPopupCard
            url={selected.url}
            name={selected.name}
            photo={selected.photo ?? mapPinIcon(selected.url, selected.logo)}
            address={selected.address}
            rating={selected.rating}
            ratingCount={selected.ratingCount}
          />
        </InfoWindow>
      )}
    </>
  );
}
