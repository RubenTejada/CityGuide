import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import HeroCarousel, { type HeroSlide } from "@/components/HeroCarousel";
import PlaceCard from "@/components/PlaceCard";
import {
  getChildren,
  getDescendantsOfType,
  getItem,
  photoUrl,
  text,
  type UmbracoItem,
} from "@/lib/umbraco";

export const revalidate = 600;

/** Sections with hand-made artwork in public/sections/. */
const SECTION_ART = new Set([
  "restaurantes",
  "bares-y-clubes",
  "tiendas",
  "cines",
  "empresas-y-servicios",
  "atracciones",
  "eventos",
  "que-hacer",
]);

/**
 * Image for a section's slide/card: the first place photo found under it,
 * falling back to the bundled SVG artwork for the section.
 */
function sectionImage(section: UmbracoItem, places: UmbracoItem[]): string {
  for (const place of places) {
    if (!place.route.path.startsWith(section.route.path)) continue;
    const photo = photoUrl(place);
    if (photo) return photo;
  }
  const slug = section.route.path.split("/").filter(Boolean).pop() ?? "";
  return `/sections/${SECTION_ART.has(slug) ? slug : "default"}.svg`;
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-DO", { dateStyle: "long" }).format(date);
}

export default async function CityLandingPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: citySlug } = await params;
  const city = await getItem(`/${citySlug}`);
  if (!city || city.contentType !== "city") notFound();

  const [sections, allPlaces, events] = await Promise.all([
    getChildren(city.route.path),
    getDescendantsOfType(city.route.path, "place", 200),
    getDescendantsOfType(city.route.path, "eventItem", 4),
  ]);

  const categories = sections.filter((s) => s.contentType === "categoryPage");
  const eventsSection = sections.find((s) => s.contentType === "eventsPage");

  const slides: HeroSlide[] = categories.slice(0, 6).map((section) => ({
    href: section.route.path,
    title: section.name,
    blurb: text(section, "intro"),
    photo: sectionImage(section, allPlaces),
  }));

  const featured = allPlaces.filter((p) => photoUrl(p)).slice(0, 6);

  return (
    <main>
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="text-3xl font-bold sm:text-4xl">{city.name}</h1>
          <p className="mt-2 max-w-2xl text-neutral-600">{text(city, "intro")}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1fr_320px]">
        <div>
          <HeroCarousel slides={slides} />

          <h2 className="mt-10 text-xl font-semibold">¿Qué buscas?</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {sections.map((section) => {
              const photo = sectionImage(section, allPlaces);
              return (
                <Link
                  key={section.id}
                  href={section.route.path}
                  className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className="relative h-28 bg-neutral-900">
                    <Image
                      src={photo}
                      alt={section.name}
                      fill
                      unoptimized={photo.endsWith(".svg")}
                      className="object-cover transition duration-300 group-hover:scale-105"
                      sizes="(min-width: 640px) 220px, 50vw"
                    />
                  </div>
                  <p className="p-3 text-center font-medium group-hover:text-amber-600">
                    {section.name}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <aside>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Próximos eventos</h2>
            {eventsSection && (
              <Link
                href={eventsSection.route.path}
                className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-neutral-700"
              >
                Ver todos
              </Link>
            )}
          </div>
          <div className="mt-5 space-y-4">
            {events.map((event) => (
              <Link
                key={event.id}
                href={event.route.path}
                className="block rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <h3 className="font-semibold">{event.name}</h3>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-amber-600">
                  {formatDate(event.properties["startDate"])}
                </p>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {text(event, "venueName")}
                </p>
                <p className="mt-2 line-clamp-3 text-sm text-neutral-600">
                  {text(event, "description")}
                </p>
                <p className="mt-2 text-sm font-medium text-amber-600">
                  Leer más…
                </p>
              </Link>
            ))}
            {events.length === 0 && (
              <p className="text-sm text-neutral-500">
                No hay eventos publicados todavía.
              </p>
            )}
          </div>
        </aside>
      </section>

      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-12">
          <h2 className="text-xl font-semibold">Lugares destacados</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
