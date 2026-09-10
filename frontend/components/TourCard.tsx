import Image from "next/image";
import Link from "next/link";

import { contentSegments, t, type Locale } from "@/lib/i18n";
import { curatedPhoto } from "@/lib/photos";
import { sectionListImage } from "@/lib/sections";
import { priceLabel, tourMeta } from "@/lib/tour";
import { photoUrl, slugOf, text, type UmbracoItem } from "@/lib/umbraco";

/**
 * Una excursión en el listado: la foto del sitio adonde va, cuánto dura, si te
 * recogen y desde cuánto sale. Lo mismo que se mira antes de apartar un día, y en ese
 * orden — se elige por el plan, no por la dirección, así que la tarjeta es la de foto
 * grande de la guía y no la de dos columnas de los lugares.
 */
export default function TourCard({
  tour,
  locale,
}: {
  tour: UmbracoItem;
  locale: Locale;
}) {
  const words = t(locale).tours;
  const citySlug = contentSegments(tour.route.path)[0] ?? "";
  const photo =
    photoUrl(tour) ??
    curatedPhoto(citySlug, slugOf(tour)) ??
    sectionListImage(tour.route.path);
  const meta = tourMeta(tour, locale, words);
  const price = priceLabel(tour, locale);

  return (
    <Link
      href={tour.route.path}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-[16/9] bg-neutral-200">
        <Image
          src={photo}
          alt={tour.name}
          fill
          unoptimized={photo.endsWith(".svg")}
          className="object-cover"
          sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold leading-snug group-hover:text-brand-600">
          {tour.name}
        </h3>
        {meta.length > 0 && (
          <p className="mt-1 text-xs text-neutral-500">{meta.join(" · ")}</p>
        )}
        <p className="mt-2 line-clamp-3 text-sm text-neutral-600">
          {text(tour, "description")}
        </p>
        <p className="mt-3 text-sm font-semibold text-brand-700">
          {price ? words.priceFrom(price) : words.priceOnRequest}
        </p>
      </div>
    </Link>
  );
}
