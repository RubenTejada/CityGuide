"use client";

import Image from "next/image";
import Link from "next/link";
import DirectionsLink from "./DirectionsLink";
import { RatingBadge } from "./Rating";
import { directionsUrl } from "@/lib/directions";

/**
 * InfoWindow content for map pins: photo thumbnail, rating and address. The
 * name goes in the InfoWindow's own header instead, so it sits on the same
 * line as the close button rather than pushing it onto an empty line of its
 * own. The whole card is the link — inside a map popup the name alone is a
 * target a few pixels tall, and clicks meant for it land on dead space. The
 * "Cómo llegar" link sits outside it: nesting one anchor in another is invalid,
 * and a pin the visitor just tapped is exactly where the route is asked for.
 */
export default function MapPopupCard({
  url,
  name,
  photo,
  address,
  rating,
  ratingCount,
  latitude,
  longitude,
}: {
  url: string;
  name: string;
  photo: string | null;
  address: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const isIcon = photo?.endsWith(".svg") ?? false;
  const directions = directionsUrl({ name, address, latitude, longitude });
  return (
    <div className="max-w-64">
      <Link
        href={url}
        className="group flex items-start gap-3 rounded-lg p-1 text-sm hover:bg-neutral-50"
      >
        {photo && (
          <div className="logo-plate relative h-16 w-16 flex-none overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <Image
              src={photo}
              alt={name}
              fill
              unoptimized={isIcon}
              className={isIcon ? "object-cover" : "object-contain p-1"}
              sizes="64px"
            />
          </div>
        )}
        <div className="min-w-0">
          <RatingBadge value={rating} count={ratingCount} className="!text-xs" />
          {address && <p className="mt-0.5 text-xs text-neutral-600">{address}</p>}
        </div>
      </Link>
      {directions && (
        <DirectionsLink
          href={directions}
          variant="link"
          className="mt-1 pl-1 !text-xs"
        />
      )}
    </div>
  );
}
