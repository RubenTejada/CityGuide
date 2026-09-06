import Image from "next/image";
import Link from "next/link";
import { facilities, photoUrl, slugOf, text, type UmbracoItem } from "@/lib/umbraco";
import { sectionListImage } from "@/lib/sections";
import FacilityBadges from "./FacilityBadges";
import Rating from "./Rating";

/**
 * Curated fallback photos (Wikimedia Commons) for seeded attractions that have
 * no photo in the CMS yet — until a paid pass runs, a seeded city has none. A
 * photo set in the backoffice always wins. Keyed by slug, or "<ciudad>/<slug>"
 * where the same name belongs to two cities (every city has a Parque Duarte).
 */
const FALLBACK_PHOTOS: Record<string, string> = {
  "santiago/monumento-a-los-heroes-de-la-restauracion":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Santiago_de_los_Caballeros_-_Monumento_a_los_H%C3%A9roes_de_la_Restauraci%C3%B3n_0772.JPG/1280px-Santiago_de_los_Caballeros_-_Monumento_a_los_H%C3%A9roes_de_la_Restauraci%C3%B3n_0772.JPG",
  "santiago/centro-leon":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Centro_Leon_Santiago.JPG/1280px-Centro_Leon_Santiago.JPG",
  "santiago/gran-teatro-del-cibao":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/GTC_Santiago.JPG/1280px-GTC_Santiago.JPG",
  "santiago/fortaleza-san-luis":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Fortaleza_San_Luis_%28Santiago%2C_Republica_Dominicana%29.jpg/1280px-Fortaleza_San_Luis_%28Santiago%2C_Republica_Dominicana%29.jpg",
  "santiago/parque-duarte":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Park_Duarte_met_Catedral_Santiago_Ap%C3%B3stol_212.jpg/1280px-Park_Duarte_met_Catedral_Santiago_Ap%C3%B3stol_212.jpg",
  "santiago/catedral-santiago-apostol":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Catedral_Santiago_Ap%C3%B3stol-IMG_0136.JPG/1280px-Catedral_Santiago_Ap%C3%B3stol-IMG_0136.JPG",
  "punta-cana/playa-bavaro":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/RD_Punta_Cana_12_2017_6547.jpg/1280px-RD_Punta_Cana_12_2017_6547.jpg",
  "punta-cana/playa-el-cortecito":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/2024_-_B%C3%A1varo_Beach_-_44.jpg/1280px-2024_-_B%C3%A1varo_Beach_-_44.jpg",
  "punta-cana/playa-macao":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Playa_Macao.jpg/1280px-Playa_Macao.jpg",
  "punta-cana/scape-park":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Dominican_Republic_Hoyo_Azul.jpg/1280px-Dominican_Republic_Hoyo_Azul.jpg",
  "punta-cana/marina-cap-cana":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Cap_Cana_Marina_Dominican_Republic.jpg/1280px-Cap_Cana_Marina_Dominican_Republic.jpg",
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

/**
 * Large-photo card for attractions, same layout as the events section cards.
 * `compact` shrinks the photo and the copy so three fit across a wide screen.
 */
export default function AttractionCard({
  place,
  compact = false,
}: {
  place: UmbracoItem;
  compact?: boolean;
}) {
  const citySlug = place.route.path.split("/").filter(Boolean)[0] ?? "";
  const photo =
    photoUrl(place) ??
    FALLBACK_PHOTOS[`${citySlug}/${slugOf(place)}`] ??
    FALLBACK_PHOTOS[slugOf(place)] ??
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
        <Image
          src={photo}
          alt={place.name}
          fill
          unoptimized={photo.endsWith(".svg")}
          className="object-cover"
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
        <Rating place={place} />
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
          <FacilityBadges facilities={facilities(place).slice(0, 3)} />
        </div>
      </div>
    </Link>
  );
}
