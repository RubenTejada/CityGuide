"use client";

import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import LogoPin from "./LogoPin";
import MapBlock, {
  MapPanelEmpty,
  MapPanelHeader,
  MapPanelList,
  MapPanelRow,
} from "./MapBlock";
import MapPopupCard from "./MapPopupCard";
import { useClusteredPins, useMarkerElements } from "./mapPins";
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

/** How many nearby places the "cerca de ti" panel lists — it scrolls inside the block. */
const NEARBY_SHOWN = 24;

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
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
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
    markers.forEach((m) =>
      bounds.extend({ lat: m.latitude, lng: m.longitude }),
    );
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
  const [position, setPosition] = useState<google.maps.LatLngLiteral | null>(
    null,
  );
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  // Row the pointer is on in the nearby panel: its pin is highlighted on the map.
  const [highlighted, setHighlighted] = useState<string | null>(null);

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
    <MapBlock
      heightClass={heightClass}
      onExit={() => setHighlighted(null)}
      side={
        position && (
          <>
            <MapPanelHeader title="Cerca de ti" />
            <MapPanelList>
              {nearby.length === 0 && (
                <MapPanelEmpty>Nada cerca por ahora.</MapPanelEmpty>
              )}
              {nearby.map(({ marker, meters }) => (
                <MapPanelRow
                  key={marker.id}
                  href={marker.url}
                  name={marker.name}
                  thumbnail={mapPinIcon(marker.url, marker.logo)}
                  rating={marker.rating}
                  ratingCount={marker.ratingCount}
                  detail={formatDistance(meters)}
                  onPoint={() => setHighlighted(marker.id)}
                />
              ))}
            </MapPanelList>
          </>
        )
      }
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
          <ClusteredMarkers markers={markers} highlighted={highlighted} />
          {position && (
            <AdvancedMarker
              position={position}
              title="Tu ubicación"
              zIndex={2000}
            >
              <VisitorPin />
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
            className="flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg ring-2 ring-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-600/70"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            {locating
              ? "Buscando tu ubicación…"
              : position
                ? "Actualizar mi ubicación"
                : "Usar mi ubicación"}
          </button>
          {locateError && (
            <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-lg ring-1 ring-neutral-300">
              {locateError}
            </p>
          )}
        </div>
      )}
    </MapBlock>
  );
}

/**
 * Where the visitor stands: a solid teardrop with a hollow centre, the only
 * pin of its shape on the map (places are logo plates, clusters are bubbles).
 * Drawn as an SVG so it stays sharp at any zoom, with its tip on the shared
 * coordinates — custom marker content is anchored bottom-centre.
 */
function VisitorPin() {
  return (
    <svg
      viewBox="84 8 344 500"
      className="h-12 w-9 drop-shadow-lg"
      role="img"
      aria-label="Tu ubicación"
    >
      <path
        fill="#e8112d"
        fillRule="evenodd"
        d="M256 8a172 172 0 0 0-172 172c0 30 8 58 22 85l122 226a32 32 0 0 0 56 0l122-226c14-27 22-55 22-85A172 172 0 0 0 256 8zm0 262a90 90 0 1 1 0-180 90 90 0 0 1 0 180z"
      />
    </svg>
  );
}

/** The pins themselves, handed to the clusterer as they mount. */
function ClusteredMarkers({
  markers,
  highlighted = null,
}: {
  markers: MapMarker[];
  /** Id of the marker the nearby panel is pointing at, if any. */
  highlighted?: string | null;
}) {
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const { elements, refFor } = useMarkerElements();

  useClusteredPins(elements, highlighted);

  return (
    <>
      {markers.map((marker) => (
        <AdvancedMarker
          key={marker.id}
          ref={refFor(marker.id)}
          position={{ lat: marker.latitude, lng: marker.longitude }}
          title={marker.name}
          // Over its neighbours, but under the clusters and the visitor's pin.
          zIndex={highlighted === marker.id ? 900 : undefined}
          onClick={() => setSelected(marker)}
        >
          <LogoPin
            logo={mapPinIcon(marker.url, marker.logo)}
            name={marker.name}
            highlighted={highlighted === marker.id}
          />
        </AdvancedMarker>
      ))}
      {selected && (
        <InfoWindow
          position={{ lat: selected.latitude, lng: selected.longitude }}
          onCloseClick={() => setSelected(null)}
          headerContent={
            <span className="text-sm font-semibold text-brand-700">
              {selected.name}
            </span>
          }
          // Focusing the popup scrolls the page to it, moving the map out
          // from under the pointer mid-click.
          shouldFocus={false}
        >
          <MapPopupCard
            url={selected.url}
            name={selected.name}
            photo={selected.photo ?? mapPinIcon(selected.url, selected.logo)}
            address={selected.address}
            rating={selected.rating}
            ratingCount={selected.ratingCount}
            latitude={selected.latitude}
            longitude={selected.longitude}
          />
        </InfoWindow>
      )}
    </>
  );
}
