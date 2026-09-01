import Link from "next/link";
import CityBadge from "@/components/CityBadge";
import JsonLd from "@/components/JsonLd";
import SiteLogo from "@/components/SiteLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { itemListJsonLd } from "@/lib/seo";
import { getCities, isComingSoon, slugOf } from "@/lib/umbraco";

export const revalidate = 600;

export default async function HomePage() {
  const cities = await getCities();

  return (
    <main className="flex-1">
      <JsonLd data={itemListJsonLd("Ciudades en QueHacerRD.com", cities)} />
      <section className="relative bg-neutral-900 text-white">
        <ThemeToggle className="absolute top-3 right-3" />
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h1 className="flex justify-center">
            <SiteLogo className="text-4xl sm:text-5xl" tagline />
          </h1>
          <p className="mt-6 text-lg text-neutral-300">
            Bares, restaurantes, atracciones y un poco más — ubícate con un clic.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="text-xl font-semibold">Elige tu ciudad</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((city) => (
            <Link
              key={city.id}
              href={`/${slugOf(city)}`}
              className="relative block rounded-3xl shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <CityBadge city={city} />
              {isComingSoon(city) && (
                <span className="absolute top-3 right-3 rounded-full bg-sun-400 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-neutral-900 uppercase">
                  Próximamente
                </span>
              )}
            </Link>
          ))}
          {cities.length === 0 && (
            <p className="text-neutral-500">
              No hay ciudades publicadas todavía.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
