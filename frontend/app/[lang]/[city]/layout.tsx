import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PendingLink,
  PendingNavProvider,
  PendingRegion,
} from "@/components/LoadingOverlay";
import SearchAutocomplete from "@/components/SearchAutocomplete";
import CitySwitcher, { type CityOption } from "@/components/CitySwitcher";
import SectionTabs from "@/components/SectionTabs";
import SiteLogo from "@/components/SiteLogo";
import SocialLinks from "@/components/SocialLinks";
import LanguageToggle from "@/components/LanguageToggle";
import { getChildren, getCities, getItem, type UmbracoItem } from "@/lib/cms";
import { contentSegments, localeHref, t, type Locale } from "@/lib/i18n";
import { isComingSoon, num, slugOf } from "@/lib/umbraco";
import ThemeToggle from "@/components/ThemeToggle";
import WeatherBadge from "@/components/Weather";
import { getCityWeather } from "@/lib/weather";

// Etiquetas cortas solo para la barra de navegación (el nombre real en el CMS
// no cambia); clave = slug de la sección, en el idioma de la página.
function navLabel(
  section: { name: string; route: { path: string } },
  locale: Locale,
) {
  const slug = contentSegments(section.route.path)[1] ?? "";
  return t(locale).nav.shortLabels[slug] ?? section.name;
}

export default async function CityLayout({
  children,
  params,
}: LayoutProps<"/[lang]/[city]">) {
  const { lang, city: citySlug } = await params;
  const locale = lang as Locale;
  const words = t(locale);
  const city = await getItem(`/${citySlug}`);
  if (!city || city.contentType !== "city") notFound();

  // A city still under construction has nothing to browse or search yet, so the
  // header keeps only the logo and the city switcher.
  const comingSoon = isComingSoon(city);
  // El clima cuelga de las coordenadas que el nodo de la ciudad ya lleva, así
  // que viaja con la cabecera de cualquier ciudad sin configurar nada.
  const [cityChildren, weather] = await Promise.all([
    comingSoon
      ? Promise.resolve<UmbracoItem[]>([])
      : getChildren(city.route.path),
    getCityWeather(num(city, "latitude"), num(city, "longitude")),
  ]);
  // "Qué Hacer" goes right after "Inicio", regardless of CMS sort order.
  const sections = cityChildren.sort(
    (a, b) =>
      Number(b.contentType === "thingsToDoPage") -
      Number(a.contentType === "thingsToDoPage"),
  );

  // Las demás ciudades viajan con la cabecera: el emblema las despliega ahí
  // mismo en vez de mandar al portal a empezar de nuevo.
  const cityOptions: CityOption[] = (await getCities()).map((option) => {
    const slug = slugOf(option);
    return {
      slug,
      name: option.name,
      href: localeHref(locale, `/${slug}`),
      comingSoon: isComingSoon(option),
    };
  });
  const current: CityOption = cityOptions.find(
    (option) => option.slug === citySlug,
  ) ?? {
    slug: citySlug,
    name: city.name,
    href: localeHref(locale, `/${citySlug}`),
    comingSoon,
  };

  return (
    <PendingNavProvider scroll>
      <div className="flex min-h-screen flex-col">
        {/* El mapa se desvanece a negro hacia la derecha del logo */}
        <header className="relative bg-neutral-900 bg-[linear-gradient(to_right,rgba(23,23,23,0),#171717_60%),url(/header-map.svg)] text-white">
          {/* Esquina de la cabecera: no cabe en la fila del logo sin empujar
              el emblema de ciudad a otra línea. */}
          {/* La esquina lleva los dos ajustes que no son contenido: idioma y tema. */}
          <div className="absolute top-3 right-3 flex items-center gap-1">
            <LanguageToggle locale={locale} />
            <ThemeToggle />
          </div>
          {/* En el móvil la cabecera es una columna centrada — logo, emblema y
              buscador a todo el ancho — y a partir de `sm` la fila de siempre. */}
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-6 pt-9 pb-6 sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-4">
            <Link
              href={localeHref(locale, `/${citySlug}`)}
              aria-label="QueHacerRD.com"
              className="sm:mt-3"
            >
              <SiteLogo
                className="text-[28px] sm:text-[44px]"
                tagline
                glyph={false}
                locale={locale}
              />
            </Link>
            {!comingSoon && (
              <SearchAutocomplete
                citySlug={citySlug}
                locale={locale}
                className="sm:mt-3"
              />
            )}
            {/* El emblema de la ciudad es el selector: dice dónde estás y
                despliega las demás sin pasar por el portal. Bajo su nombre va
                el clima, que es un dato de esa ciudad y de ninguna otra. */}
            <div className="flex shrink-0 flex-col items-center gap-2">
              <CitySwitcher
                current={current}
                cities={cityOptions}
                allCitiesHref={localeHref(locale, "/")}
              />
              <WeatherBadge
                weather={weather}
                cityName={current.name}
                locale={locale}
              />
            </div>
          </div>
          {!comingSoon && (
            <SectionTabs
              home={localeHref(locale, `/${citySlug}`)}
              sections={sections.map((section) => ({
                id: section.id,
                href: section.route.path,
                label: navLabel(section, locale),
              }))}
              locale={locale}
            />
          )}
        </header>
        <PendingRegion className="flex-1" label={words.nav.loadingSection}>
          {children}
        </PendingRegion>

        <footer className="mt-12 bg-neutral-900 text-neutral-400">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <SiteLogo className="text-lg" tagline locale={locale} />
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
              <PendingLink
                href={localeHref(locale, `/${citySlug}/contacto`)}
                className="hover:text-white"
              >
                {words.nav.contact}
              </PendingLink>
            </div>
            <SocialLinks locale={locale} className="mt-6" />
            <p className="mt-8 text-xs text-neutral-600">
              © {new Date().getFullYear()} QueHacerRD.com — {words.site.rights}
            </p>
          </div>
        </footer>
      </div>
    </PendingNavProvider>
  );
}
