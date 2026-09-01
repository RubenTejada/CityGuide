"use client";

import Image from "next/image";
import Link from "next/link";
import { RatingBadge } from "./Rating";

/** InfoWindow content for map pins: photo thumbnail, name, rating and address. */
export default function MapPopupCard({
  url,
  name,
  photo,
  address,
  rating,
  ratingCount,
}: {
  url: string;
  name: string;
  photo: string | null;
  address: string | null;
  rating?: number | null;
  ratingCount?: number | null;
}) {
  const isIcon = photo?.endsWith(".svg") ?? false;
  return (
    <div className="flex max-w-64 items-start gap-3 text-sm">
      {photo && (
        <div className="relative h-16 w-16 flex-none overflow-hidden rounded-lg border border-neutral-200 bg-white">
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
        <Link href={url} className="font-semibold text-brand-700 hover:underline">
          {name}
        </Link>
        <div>
          <RatingBadge value={rating} count={ratingCount} className="!text-xs" />
        </div>
        {address && <p className="mt-0.5 text-xs text-neutral-600">{address}</p>}
      </div>
    </div>
  );
}
