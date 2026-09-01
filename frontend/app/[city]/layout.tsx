import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PendingLink,
  PendingNavProvider,
  PendingRegion,
} from "@/components/LoadingOverlay";
import SearchAutocomplete from "@/components/SearchAutocomplete";
import { CityEmblem } from "@/components/CityBadge";
import SiteLogo from "@/components/SiteLogo";
import { getChildren, getItem, isComingSoon } from "@/lib/umbraco";

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

  // A city still under construction has nothing to browse or search yet, so the
  // header keeps only the logo and the city switcher.
  const comingSoon = isComingSoon(city);
  // "Qué Hacer" goes right after "Inicio", regardless of CMS sort order.
  const sections = (comingSoon ? [] : await getChildren(city.route.path)).sort(
    (a, b) =>
      Number(b.contentType === "thingsToDoPage") -
      Number(a.contentType === "thingsToDoPage"),
  );

  return (
    <PendingNavProvider scroll>
      <div className="flex min-h-screen flex-col">
        {/* El mapa se desvanece a negro hacia la derecha del logo */}
        <header className="bg-neutral-900 bg-[linear-gradient(to_right,rgba(23,23,23,0),#171717_60%),url(/header-map.svg)] text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-4 px-6 py-6">
            <Link href={`/${citySlug}`} aria-label="QueHacerRD.com">
              <SiteLogo className="text-[28px] sm:text-[44px]" tagline glyph={false} />
            </Link>
            {!comingSoon && <SearchAutocomplete citySlug={citySlug} />}
            {/* El emblema de la ciudad es el selector: dice dónde estás y
                lleva al portal para cambiar de ciudad. */}
            <Link
              href="/"
              className="ml-auto flex shrink-0 flex-col items-center rounded-2xl px-2 py-1 transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun-300 sm:ml-0"
              title="Cambiar ciudad"
            >
              <CityEmblem
                slug={citySlug}
                ring={false}
                className="h-24 w-auto sm:h-32"
              />
              <span className="mt-2 text-xs font-light tracking-[0.28em] text-white uppercase">
                {city.name}
              </span>
            </Link>
          </div>
          {!comingSoon && (
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
          )}
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
