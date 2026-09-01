import Link from "next/link";
import { notFound } from "next/navigation";
import SiteLogo from "@/components/SiteLogo";
import { getChildren, getItem } from "@/lib/umbraco";

export default async function CityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ city: string }>;
}) {
  const { city: citySlug } = await params;
  const city = await getItem(`/${citySlug}`);
  if (!city || city.contentType !== "city") notFound();

  // "Qué Hacer" goes right after "Inicio", regardless of CMS sort order.
  const sections = (await getChildren(city.route.path)).sort(
    (a, b) =>
      Number(b.contentType === "thingsToDoPage") -
      Number(a.contentType === "thingsToDoPage"),
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-4 px-6 py-10">
          <Link href={`/${citySlug}`} aria-label="QueHacerRD.com">
            <SiteLogo className="text-[44px]" />
          </Link>
          <form
            action={`/${citySlug}/buscar`}
            className="order-last flex w-full min-w-0 flex-1 sm:order-none sm:w-auto"
            role="search"
          >
            <input
              type="search"
              name="q"
              placeholder="Busca por nombre, sector, calle o categoría"
              className="w-full min-w-0 rounded-l-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-sun-400 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-r-lg bg-sun-400 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-sun-300"
            >
              Buscar
            </button>
          </form>
          <Link
            href="/"
            className="ml-auto text-sm text-neutral-400 hover:text-white sm:ml-0"
          >
            Cambiar ciudad
          </Link>
        </div>
        <nav className="border-t border-neutral-800">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-1 px-6">
            <Link
              href={`/${citySlug}`}
              className="px-3 py-3 text-sm font-medium uppercase tracking-wide text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              Inicio
            </Link>
            {sections.map((section) => (
              <Link
                key={section.id}
                href={section.route.path}
                className="px-3 py-3 text-sm font-medium uppercase tracking-wide text-neutral-300 hover:bg-neutral-800 hover:text-white"
              >
                {section.name}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mt-12 bg-neutral-900 text-neutral-400">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <SiteLogo className="text-lg" tagline />
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {sections.map((section) => (
              <Link
                key={section.id}
                href={section.route.path}
                className="hover:text-white"
              >
                {section.name}
              </Link>
            ))}
          </div>
          <p className="mt-8 text-xs text-neutral-600">
            © {new Date().getFullYear()} QueHacerRD.com — Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: citySlug } = await params;
  const city = await getItem(`/${citySlug}`);
  return { title: city?.name ?? "Ciudad" };
}
