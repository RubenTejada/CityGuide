import Image from "next/image";
import Link from "next/link";
import { facilities, photoUrl, text, type UmbracoItem } from "@/lib/umbraco";
import { sectionListImage } from "@/lib/sections";
import FacilityBadges from "./FacilityBadges";
import Rating from "./Rating";

export default function PlaceCard({
  place,
  fallbackPhoto,
}: {
  place: UmbracoItem;
  fallbackPhoto?: string | null;
}) {
  const ownPhoto = photoUrl(place);
  const inherited = ownPhoto ?? fallbackPhoto ?? null;
  // No photo and no inheritable logo: fall back to the section's image.
  const photo = inherited ?? sectionListImage(place.route.path);
  // Company logos (company cards, or branches inheriting the parent logo) are
  // arbitrary aspect ratios: letterbox them instead of cropping to the square.
  const isLogo =
    inherited !== null && (place.contentType === "company" || ownPhoto === null);
  return (
    <Link
      href={place.route.path}
      className="group flex gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md"
    >
      <div
        className={`relative h-24 w-24 flex-none overflow-hidden rounded-lg ${
          isLogo ? "border border-neutral-200 bg-white" : "bg-neutral-200"
        }`}
      >
        <Image
          src={photo}
          alt={place.name}
          fill
          unoptimized={photo.endsWith(".svg")}
          className={isLogo ? "object-contain p-2" : "object-cover"}
          sizes="96px"
        />
      </div>
      <div className="min-w-0">
        <h3 className="truncate font-semibold group-hover:text-brand-600">
          {place.name}
        </h3>
        <Rating place={place} />
        <p className="mt-0.5 truncate text-sm text-neutral-500">
          {text(place, "address")}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-neutral-600">
          {text(place, "description")}
        </p>
        <div className="mt-2">
          <FacilityBadges facilities={facilities(place).slice(0, 3)} />
        </div>
      </div>
    </Link>
  );
}
