import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import SiteLogo from "@/components/SiteLogo";
import { itemListJsonLd } from "@/lib/seo";
import { getCities, slugOf, text } from "@/lib/umbraco";

export const revalidate = 600;

export default async function HomePage() {
  const cities = await getCities();

  return (
    <main className="flex-1">
      <JsonLd data={itemListJsonLd("Ciudades en QueHacerRD.com", cities)} />
      <section className="bg-neutral-900 text-white">
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
              className="group rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <h3 className="text-lg font-semibold group-hover:text-brand-600">
                {city.name}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">{text(city, "country")}</p>
              <p className="mt-3 line-clamp-2 text-sm text-neutral-600">
                {text(city, "intro")}
              </p>
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
