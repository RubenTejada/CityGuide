import { INTL_LOCALE, t, type Locale } from "@/lib/i18n";
import { getPlaceReviews } from "@/lib/portalApi";
import { accountsEnabled } from "@/lib/session";
import { num, type UmbracoItem } from "@/lib/umbraco";
import { RatingPair } from "@/components/RatingBadge";
import ReviewComposer from "./ReviewComposer";
import Stars from "./Stars";

/**
 * Las opiniones de los visitantes sobre un establecimiento: la valoración del portal
 * junto a la de Google — cada una con su nombre, nunca promediadas —, la caja para
 * opinar y la lista, de la más reciente a la más antigua.
 *
 * La lista se pinta en el servidor desde la caché ("reviews"), así que un buscador la
 * lee con la ficha; lo único que se pide desde el navegador es lo del visitante.
 */
export default async function PlaceReviews({
  place,
  locale,
}: {
  place: UmbracoItem;
  locale: Locale;
}) {
  const words = t(locale).reviews;
  const { summary, reviews } = await getPlaceReviews(place.id);
  // Sin cuentas configuradas nadie puede opinar: "¡sé el primero!" sería una promesa vacía.
  if (!accountsEnabled() && reviews.length === 0) return null;
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    // El día en la ciudad, no en el reloj del servidor (UTC): una opinión de las once
    // de la noche no es de mañana.
    timeZone: "America/Santo_Domingo",
  });

  return (
    <section id="opiniones" className="mt-10 scroll-mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{words.heading}</h2>
        <RatingPair
          google={num(place, "googleRating")}
          googleCount={num(place, "googleRatingCount")}
          site={summary?.average}
          siteCount={summary?.count}
          locale={locale}
        />
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
        <ReviewComposer placeId={place.id} />

        {reviews.length === 0 ? (
          <p className="text-sm text-neutral-500">{words.empty}</p>
        ) : (
          <ul className="space-y-4">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{review.author}</span>
                  <Stars value={review.rating} label={words.star(review.rating)} />
                  <span className="text-xs text-neutral-500">
                    {date.format(new Date(review.createdUtc))}
                    {review.updatedUtc.slice(0, 10) !== review.createdUtc.slice(0, 10) &&
                      ` · ${words.edited}`}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">
                    {review.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
