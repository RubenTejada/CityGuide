"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map,
  Pin,
} from "@vis.gl/react-google-maps";
import LogoPin from "./LogoPin";

interface NearbyPlace {
  id: string;
  name: string;
  url: string;
  category: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  photo: string | null;
}

interface PlaceMapProps {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Logo/photo shown inside the place's own map pin. */
  photo?: string | null;
  /** Show the "¿Qué está cerca?" panel with nearby places. */
  showNearby?: boolean;
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export default function PlaceMap({
  id,
  name,
  latitude,
  longitude,
  photo = null,
  showNearby = true,
}: PlaceMapProps) {
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [selected, setSelected] = useState<NearbyPlace | null>(null);

  useEffect(() => {
    if (!showNearby) return;
    const controller = new AbortController();
    fetch(
      `/api/nearby?lat=${latitude}&lng=${longitude}&radius=2500&exclude=${id}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : []))
      .then(setNearby)
      .catch(() => {});
    return () => controller.abort();
  }, [id, latitude, longitude, showNearby]);

  if (!MAPS_KEY) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500">
        Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      {showNearby && (
        <aside className="order-2 lg:order-1">
          <h3 className="font-semibold">¿Qué está cerca?</h3>
          <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {nearby.length === 0 && (
              <li className="p-3 text-sm text-neutral-500">
                Nada cerca por ahora.
              </li>
            )}
            {nearby.slice(0, 8).map((place) => (
              <li key={place.id}>
                <Link
                  href={place.url}
                  className="block p-3 text-sm hover:bg-neutral-50"
                >
                  <span className="font-medium">{place.name}</span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    {place.category} · {Math.round(place.distanceMeters)} m
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div className="order-1 h-72 overflow-hidden rounded-xl lg:order-2 lg:h-96">
        <APIProvider apiKey={MAPS_KEY}>
          <Map
            defaultCenter={{ lat: latitude, lng: longitude }}
            defaultZoom={15}
            mapId="cityguide"
            gestureHandling="cooperative"
          >
            <AdvancedMarker position={{ lat: latitude, lng: longitude }} title={name}>
              {photo ? (
                <LogoPin logo={photo} name={name} />
              ) : (
                <Pin background="#f59e0b" borderColor="#b45309" glyphColor="#fff" />
              )}
            </AdvancedMarker>
            {nearby.map((place) => (
              <AdvancedMarker
                key={place.id}
                position={{ lat: place.latitude, lng: place.longitude }}
                title={place.name}
                onClick={() => setSelected(place)}
              >
                {place.photo ? <LogoPin logo={place.photo} name={place.name} /> : null}
              </AdvancedMarker>
            ))}
            {selected && (
              <InfoWindow
                position={{ lat: selected.latitude, lng: selected.longitude }}
                onCloseClick={() => setSelected(null)}
              >
                <div className="text-sm">
                  <Link href={selected.url} className="font-semibold text-brand-700">
                    {selected.name}
                  </Link>
                  <p className="text-neutral-600">{selected.address}</p>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>
    </div>
  );
}
