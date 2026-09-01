"use client";

import { useEffect, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import LogoPin from "./LogoPin";
import MapPopupCard from "./MapPopupCard";
import { mapPinIcon } from "@/lib/sections";

export interface BranchMarker {
  id: string;
  name: string;
  url: string;
  address: string | null;
  latitude: number;
  longitude: number;
  /** Company logo, drawn inside the map pin. */
  logo: string | null;
  /** Branch photo — popup card only; omitted, the card shows the pin icon. */
  photo?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** Adjusts the viewport to contain every branch marker. */
function FitBranches({ branches }: { branches: BranchMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || branches.length === 0) return;
    if (branches.length === 1) {
      map.setCenter({ lat: branches[0].latitude, lng: branches[0].longitude });
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    branches.forEach((b) => bounds.extend({ lat: b.latitude, lng: b.longitude }));
    map.fitBounds(bounds, 48);
  }, [map, branches]);
  return null;
}

export default function BranchesMap({ branches }: { branches: BranchMarker[] }) {
  const [selected, setSelected] = useState<BranchMarker | null>(null);

  if (!MAPS_KEY) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500">
        Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.
      </div>
    );
  }

  return (
    <div className="h-72 overflow-hidden rounded-xl lg:h-96">
      <APIProvider apiKey={MAPS_KEY}>
        <Map
          defaultCenter={{ lat: branches[0].latitude, lng: branches[0].longitude }}
          defaultZoom={13}
          mapId="cityguide"
          gestureHandling="cooperative"
        >
          <FitBranches branches={branches} />
          {branches.map((branch) => (
            <AdvancedMarker
              key={branch.id}
              position={{ lat: branch.latitude, lng: branch.longitude }}
              title={branch.name}
              onClick={() => setSelected(branch)}
            >
              <LogoPin
                logo={mapPinIcon(branch.url, branch.logo)}
                name={branch.name}
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
        </Map>
      </APIProvider>
    </div>
  );
}
