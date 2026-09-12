import PhotoFit from "@/components/PhotoFit";
import Link from "next/link";
import { contentSegments, type Locale } from "@/lib/i18n";
import {
  facilities,
  photoOf,
  slugOf,
  text,
  type UmbracoItem,
} from "@/lib/umbraco";
import { curatedPhoto } from "@/lib/photos";
import { sectionListImage } from "@/lib/sections";
import FacilityBadges from "./FacilityBadges";
import Rating from "./Rating";

/**
 * Large-photo card for attractions, same layout as the events section cards.
 * `compact` shrinks the photo and the copy so three fit across a wide screen.
 */
export default function AttractionCard({
  locale,
  place,
  compact = false,
}: {
  locale: Locale;
  place: UmbracoItem;
  compact?: boolean;
}) {
  const citySlug = contentSegments(place.route.path)[0] ?? "";
  const own = photoOf(place);
  const photo =
    own?.url ??
    curatedPhoto(citySlug, slugOf(place)) ??
    sectionListImage(place.route.path);
  return (
    <Link
      href={place.route.path}
      className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div
        className={`relative bg-neutral-200 ${
          compact ? "aspect-[16/7]" : "aspect-[2/1]"
        }`}
      >
        <PhotoFit
          src={photo}
          alt={place.name}
          width={own?.width}
          height={own?.height}
          box={compact ? 16 / 7 : 2}
          sizes={
            compact
              ? "(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
              : "(min-width: 768px) 50vw, 100vw"
          }
        />
      </div>
      <div className={compact ? "p-3" : "p-5"}>
        <h3
          className={`font-semibold group-hover:text-brand-600 ${
            compact ? "truncate text-sm" : ""
          }`}
        >
          {place.name}
        </h3>
        <Rating place={place} locale={locale} />
        <p
          className={`truncate text-neutral-500 ${
            compact ? "mt-0.5 text-xs" : "mt-1 text-sm"
          }`}
        >
          {text(place, "address")}
        </p>
        <p
          className={`text-neutral-600 ${
            compact ? "mt-1 line-clamp-2 text-xs" : "mt-2 line-clamp-3 text-sm"
          }`}
        >
          {text(place, "description")}
        </p>
        <div className={compact ? "mt-2" : "mt-3"}>
          <FacilityBadges
            facilities={facilities(place).slice(0, 3)}
            locale={locale}
          />
        </div>
      </div>
    </Link>
  );
}
