import { num, text, type UmbracoItem } from "./umbraco";

export interface DirectionsTarget {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Google place id, when the CMS stores one: it pins the exact listing. */
  placeId?: string | null;
}

/**
 * Google Maps directions URL for a place — the universal cross-platform link,
 * which opens the app on a phone and the site on a desktop. The destination is
 * the name and address a person reads, the place id (when there is one) is what
 * makes Google resolve it to that exact listing rather than to a namesake, and
 * the coordinates are the fallback for a node with no address. A place with
 * none of the three cannot be routed to and gets no link.
 */
export function directionsUrl(target: DirectionsTarget): string | null {
  const address = target.address?.trim() ?? "";
  const latitude = target.latitude ?? 0;
  const longitude = target.longitude ?? 0;
  const located = latitude !== 0 || longitude !== 0;
  const destination = address
    ? `${target.name}, ${address}`
    : located
      ? `${latitude},${longitude}`
      : "";
  if (!destination) return null;
  const params = new URLSearchParams({ api: "1", destination });
  if (target.placeId) params.set("destination_place_id", target.placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** The same link for a CMS node: a branch is routed to under its display name. */
export function itemDirectionsUrl(
  item: UmbracoItem,
  name = item.name,
): string | null {
  return directionsUrl({
    name,
    address: text(item, "address"),
    latitude: num(item, "latitude"),
    longitude: num(item, "longitude"),
    placeId: text(item, "googlePlaceId"),
  });
}
