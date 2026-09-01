import Image from "next/image";
import Link from "next/link";
import { facilities, photoUrl, slugOf, text, type UmbracoItem } from "@/lib/umbraco";
import { sectionListImage } from "@/lib/sections";
import FacilityBadges from "./FacilityBadges";
import Rating from "./Rating";

/**
 * Curated fallback photos (Wikimedia Commons) for seeded attractions that have
 * no photo in the CMS yet. A photo set in the backoffice always wins.
 */
const FALLBACK_PHOTOS: Record<string, string> = {
  "malecon-de-santo-domingo":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Malecon_de_Santo_Domingo_2013-10-01_21-33.jpg/1280px-Malecon_de_Santo_Domingo_2013-10-01_21-33.jpg",
  "parque-zoologico-nacional":
    "https://upload.wikimedia.org/wikipedia/commons/7/74/Flamingos_%2833322097221%29.jpg",
  "jardin-botanico-nacional":
    "https://upload.wikimedia.org/wikipedia/commons/0/07/Jard%C3%ADn_Bot%C3%A1nico_Nacional_%2833318691991%29.jpg",
  "parque-mirador-sur":
    "https://upload.wikimedia.org/wikipedia/commons/d/d8/Parque_Mirador_Sur_-_Santo_Domingo.jpg",
  "zona-colonial":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Calle_las_Damas%2C_Santo_Domingo%2C_Zona_Colonial.jpg/1280px-Calle_las_Damas%2C_Santo_Domingo%2C_Zona_Colonial.jpg",
};

/** Large-photo card for attractions, same layout as the events section cards. */
export default function AttractionCard({ place }: { place: UmbracoItem }) {
  const photo =
    photoUrl(place) ??
    FALLBACK_PHOTOS[slugOf(place)] ??
    sectionListImage(place.route.path);
  return (
    <Link
      href={place.route.path}
      className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-[2/1] bg-neutral-200">
        <Image
          src={photo}
          alt={place.name}
          fill
          unoptimized={photo.endsWith(".svg")}
          className="object-cover"
          sizes="(min-width: 768px) 50vw, 100vw"
        />
      </div>
      <div className="p-5">
        <h3 className="font-semibold group-hover:text-brand-600">{place.name}</h3>
        <Rating place={place} />
        <p className="mt-1 truncate text-sm text-neutral-500">
          {text(place, "address")}
        </p>
        <p className="mt-2 line-clamp-3 text-sm text-neutral-600">
          {text(place, "description")}
        </p>
        <div className="mt-3">
          <FacilityBadges facilities={facilities(place).slice(0, 3)} />
        </div>
      </div>
    </Link>
  );
}
