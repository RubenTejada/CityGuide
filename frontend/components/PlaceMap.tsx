"use client";

import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map,
  Pin,
} from "@vis.gl/react-google-maps";
import FilterDropdown from "./FilterDropdown";
import LoadingOverlay from "./LoadingOverlay";
import LogoPin from "./LogoPin";
import MapBlock, {
  MapPanelEmpty,
  MapPanelHeader,
  MapPanelList,
  MapPanelRow,
} from "./MapBlock";
import MapPopupCard from "./MapPopupCard";
import { useClusteredPins, useMarkerElements } from "./mapPins";
import { mapPinIcon, sectionIconByName, sectionMapIcon } from "@/lib/sections";

interface NearbyPlace {
  id: string;
  name: string;
  url: string;
  category: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  /** Real photo of the place — popup card only. */
  photo: string | null;
  /** Company logo when the place is a branch; null otherwise. */
  icon: string | null;
  rating: number | null;
  ratingCount: number | null;
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

/** How many neighbours the panel lists — it scrolls inside the block. */
const NEARBY_SHOWN = 24;

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
  // Row the pointer is on in the nearby list: its pin is highlighted on the map.
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  // Key of the request whose result is on screen: while it differs from the
  // current one, the panel is still loading and stays covered.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const nearbyKey = `${id}:${latitude}:${longitude}`;
  const loadingNearby = showNearby && loadedKey !== nearbyKey;

  useEffect(() => {
    if (!showNearby) return;
    const controller = new AbortController();
    fetch(
      `/api/nearby?lat=${latitude}&lng=${longitude}&radius=2500&exclude=${id}&limit=100`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((places: NearbyPlace[]) => {
        setNearby(places);
        setLoadedKey(nearbyKey);
      })
      .catch(() => {
        // Aborted requests are superseded by the next one, which keeps the
        // overlay up; a real failure ends it with the empty list showing.
        if (!controller.signal.aborted) setLoadedKey(nearbyKey);
      });
    return () => controller.abort();
  }, [id, latitude, longitude, showNearby, nearbyKey]);

  // Only the categories the neighbourhood actually has, in distance order so
  // the closest kind of place heads the list.
  const categoryOptions = useMemo(
    () => [...new Set(nearby.map((place) => place.category).filter(Boolean))],
    [nearby],
  );
  const shown = categories.length
    ? nearby.filter((place) => categories.includes(place.category))
    : nearby;

  const toggleCategory = (value: string) =>
    setCategories((current) =>
      current.includes(value)
        ? current.filter((c) => c !== value)
        : [...current, value],
    );

  if (!MAPS_KEY) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500">
        Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.
      </div>
    );
  }

  return (
    <MapBlock
      heightClass="aspect-square lg:aspect-auto lg:h-[30rem]"
      onExit={() => setHighlighted(null)}
      side={
        showNearby && (
          <>
            <LoadingOverlay show={loadingNearby} label="Buscando cerca…" />
            <MapPanelHeader title="¿Qué está cerca?">
              {categoryOptions.length > 1 && (
                <FilterDropdown
                  label="Categorías"
                  options={categoryOptions}
                  selected={categories}
                  onToggle={toggleCategory}
                  icons={Object.fromEntries(
                    categoryOptions.map((c) => [c, sectionIconByName(c)]),
                  )}
                  className="relative"
                />
              )}
            </MapPanelHeader>
            <MapPanelList>
              {shown.length === 0 && (
                <MapPanelEmpty>
                  {nearby.length === 0
                    ? "Nada cerca por ahora."
                    : "Nada cerca en esas categorías."}
                </MapPanelEmpty>
              )}
              {shown.slice(0, NEARBY_SHOWN).map((place) => (
                <MapPanelRow
                  key={place.id}
                  href={place.url}
                  name={place.name}
                  thumbnail={mapPinIcon(place.url, place.icon)}
                  rating={place.rating}
                  ratingCount={place.ratingCount}
                  detail={`${place.category} · ${Math.round(place.distanceMeters)} m`}
                  onPoint={() => setHighlighted(place.id)}
                />
              ))}
            </MapPanelList>
          </>
        )
      }
    >
      <APIProvider apiKey={MAPS_KEY}>
        <Map
          defaultCenter={{ lat: latitude, lng: longitude }}
          defaultZoom={15}
          mapId="cityguide"
          gestureHandling="cooperative"
        >
          {/* The place the page is about: dark pin, drawn over the rest. */}
          <AdvancedMarker
            position={{ lat: latitude, lng: longitude }}
            title={name}
            zIndex={1000}
          >
            {photo ? (
              <LogoPin logo={photo} name={name} current />
            ) : (
              <Pin
                background="#175877"
                borderColor="#ffffff"
                glyphColor="#ffffff"
                scale={1.3}
              />
            )}
          </AdvancedMarker>
          <NearbyPins
            places={shown}
            highlighted={highlighted}
            onSelect={setSelected}
          />
          {selected && shown.some((place) => place.id === selected.id) && (
            <InfoWindow
              position={{ lat: selected.latitude, lng: selected.longitude }}
              onCloseClick={() => setSelected(null)}
              headerContent={
                <span className="text-sm font-semibold text-brand-700">
                  {selected.name}
                </span>
              }
              // Focusing the popup scrolls the page to it, moving the map
              // out from under the pointer mid-click.
              shouldFocus={false}
            >
              <MapPopupCard
                url={selected.url}
                name={selected.name}
                photo={selected.photo ?? sectionMapIcon(selected.url)}
                address={selected.address}
                rating={selected.rating}
                ratingCount={selected.ratingCount}
              />
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </MapBlock>
  );
}

/**
 * The neighbourhood pins: clustered, so a dense sector reads as one bubble
 * carrying its count instead of a pile of overlapping plates, and framed on
 * the row the "¿Qué está cerca?" list is pointing at. Its own component
 * because the clustering hooks need the `<Map>` above them.
 */
function NearbyPins({
  places,
  highlighted,
  onSelect,
}: {
  places: NearbyPlace[];
  /** Id of the place the nearby list is pointing at, if any. */
  highlighted: string | null;
  onSelect: (place: NearbyPlace) => void;
}) {
  const { elements, refFor } = useMarkerElements();

  useClusteredPins(elements, highlighted);

  return (
    <>
      {places.map((place) => (
        <AdvancedMarker
          key={place.id}
          ref={refFor(place.id)}
          position={{ lat: place.latitude, lng: place.longitude }}
          title={place.name}
          // Over its neighbours, but under the place the page is about.
          zIndex={highlighted === place.id ? 900 : undefined}
          onClick={() => onSelect(place)}
        >
          <LogoPin
            logo={mapPinIcon(place.url, place.icon)}
            name={place.name}
            highlighted={highlighted === place.id}
          />
        </AdvancedMarker>
      ))}
    </>
  );
}
