import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PendingLink,
  PendingNavProvider,
  PendingRegion,
} from "@/components/LoadingOverlay";
import SearchAutocomplete from "@/components/SearchAutocomplete";
import SiteLogo from "@/components/SiteLogo";
import { getChildren, getItem } from "@/lib/umbraco";

// Etiquetas cortas solo para la barra de navegación (el nombre real en el CMS
// no cambia); clave = slug de la sección.
const NAV_LABELS: Record<string, string> = {
  "empresas-y-servicios": "Empresas",
};

function navLabel(section: { name: string; route: { path: string } }) {
  const slug = section.route.path.split("/").filter(Boolean)[1] ?? "";
  return NAV_LABELS[slug] ?? section.name;
}

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
    <PendingNavProvider scroll>
      <div className="flex min-h-screen flex-col">
        {/* El mapa se desvanece a negro hacia la derecha del logo */}
        <header className="bg-neutral-900 bg-[linear-gradient(to_right,rgba(23,23,23,0),#171717_60%),url(/header-map.svg)] text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-4 px-6 py-10">
            <Link href={`/${citySlug}`} aria-label="QueHacerRD.com">
              <SiteLogo className="text-[44px]" tagline />
            </Link>
            <SearchAutocomplete citySlug={citySlug} />
            <Link
              href="/"
              className="ml-auto text-sm text-neutral-400 hover:text-white sm:ml-0"
            >
              Cambiar ciudad
            </Link>
          </div>
          <nav className="border-t border-neutral-800">
            <div className="mx-auto flex max-w-6xl flex-wrap gap-1 px-6">
              <PendingLink
                href={`/${citySlug}`}
                className="px-3 py-3 text-sm font-medium uppercase tracking-wide text-neutral-300 hover:bg-neutral-800 hover:text-white"
              >
                Inicio
              </PendingLink>
              {sections.map((section) => (
                <PendingLink
                  key={section.id}
                  href={section.route.path}
                  className="px-3 py-3 text-sm font-medium uppercase tracking-wide text-neutral-300 hover:bg-neutral-800 hover:text-white"
                >
                  {navLabel(section)}
                </PendingLink>
              ))}
            </div>
          </nav>
        </header>
        <PendingRegion className="flex-1" label="Cargando sección…">
          {children}
        </PendingRegion>

        <footer className="mt-12 bg-neutral-900 text-neutral-400">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <SiteLogo className="text-lg" tagline />
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {sections.map((section) => (
                <PendingLink
                  key={section.id}
                  href={section.route.path}
                  className="hover:text-white"
                >
                  {section.name}
                </PendingLink>
              ))}
            </div>
            <p className="mt-8 text-xs text-neutral-600">
              © {new Date().getFullYear()} QueHacerRD.com — Todos los derechos
              reservados.
            </p>
          </div>
        </footer>
      </div>
    </PendingNavProvider>
  );
}
