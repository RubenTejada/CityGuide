import Image from "next/image";
import Link from "next/link";
import { facilities, photoUrl, text, type UmbracoItem } from "@/lib/umbraco";
import { branchDisplayName } from "@/lib/branches";
import { sectionListImage } from "@/lib/sections";
import FacilityBadges from "./FacilityBadges";
import Rating from "./Rating";

export default function PlaceCard({
  place,
  fallbackPhoto,
  company,
  compact = false,
}: {
  place: UmbracoItem;
  fallbackPhoto?: string | null;
  /** Company this place is a branch of: its name qualifies the branch's own. */
  company?: UmbracoItem | null;
  /** Denser card: smaller thumbnail and one line of description. */
  compact?: boolean;
}) {
  const name = branchDisplayName(place.name, company?.name);
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
      className={`group flex rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md ${
        compact ? "gap-3 p-3" : "gap-4 p-4"
      }`}
    >
      <div
        className={`relative flex-none overflow-hidden rounded-lg ${
          compact ? "h-20 w-20" : "h-28 w-28 sm:h-36 sm:w-36"
        } ${
          isLogo ? "logo-plate border border-neutral-200 bg-white" : "bg-neutral-200"
        }`}
      >
        <Image
          src={photo}
          alt={name}
          fill
          unoptimized={photo.endsWith(".svg")}
          className={isLogo ? "object-contain p-2" : "object-cover"}
          sizes={compact ? "80px" : "(min-width: 640px) 144px, 112px"}
        />
      </div>
      <div className="min-w-0">
        <h3
          className={`truncate font-semibold group-hover:text-brand-600 ${
            compact ? "text-sm" : ""
          }`}
        >
          {name}
        </h3>
        <Rating place={place} />
        <p
          className={`mt-0.5 truncate text-neutral-500 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {text(place, "address")}
        </p>
        <p
          className={`mt-1 text-neutral-600 ${
            compact ? "line-clamp-1 text-xs" : "line-clamp-2 text-sm"
          }`}
        >
          {text(place, "description")}
        </p>
        <div className={compact ? "mt-1.5" : "mt-2"}>
          <FacilityBadges facilities={facilities(place).slice(0, 3)} />
        </div>
      </div>
    </Link>
  );
}
