"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import LogoPin from "./LogoPin";

export interface BranchMarker {
  id: string;
  name: string;
  url: string;
  address: string | null;
  latitude: number;
  longitude: number;
  logo: string | null;
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
              {branch.logo ? (
                <LogoPin logo={branch.logo} name={branch.name} />
              ) : (
                <Pin background="#f59e0b" borderColor="#b45309" glyphColor="#fff" />
              )}
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
  );
}
