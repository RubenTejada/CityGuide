import type { MetadataRoute } from "next";
import { getCities, getDescendants } from "@/lib/cms";
import { HREFLANG, localeHref, LOCALES, type Locale } from "@/lib/i18n";
import { cleanPath, SITE_URL } from "@/lib/seo";
import { isComingSoon, type UmbracoItem } from "@/lib/umbraco";

export const revalidate = 600;

/** How often each content type is expected to change, and how it ranks. */
const SITEMAP_HINTS: Record<
  string,
  {
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }
> = {
  city: { changeFrequency: "daily", priority: 0.9 },
  categoryPage: { changeFrequency: "daily", priority: 0.8 },
  thingsToDoPage: { changeFrequency: "daily", priority: 0.8 },
  eventsPage: { changeFrequency: "daily", priority: 0.8 },
  articlesPage: { changeFrequency: "weekly", priority: 0.7 },
  subcategory: { changeFrequency: "weekly", priority: 0.7 },
  mall: { changeFrequency: "weekly", priority: 0.7 },
  company: { changeFrequency: "weekly", priority: 0.7 },
  place: { changeFrequency: "weekly", priority: 0.6 },
  tour: { changeFrequency: "weekly", priority: 0.6 },
  article: { changeFrequency: "monthly", priority: 0.6 },
  eventItem: { changeFrequency: "daily", priority: 0.6 },
  movie: { changeFrequency: "daily", priority: 0.4 },
};

/**
 * The `alternates.languages` map of one page: itself, its counterpart, and the
 * x-default every pair also declares. Only listed when the page really exists in
 * both languages — an alternate pointing at a 404 makes Google drop the pair.
 */
function languages(
  byLocale: Partial<Record<Locale, string>>,
): Record<string, string> | undefined {
  const known = LOCALES.filter((locale) => byLocale[locale]);
  if (known.length < 2) return undefined;
  return {
    ...Object.fromEntries(
      known.map((locale) => [
        HREFLANG[locale],
        `${SITE_URL}${cleanPath(byLocale[locale]!)}`,
      ]),
    ),
    "x-default": `${SITE_URL}${cleanPath(byLocale.es!)}`,
  };
}

function entry(
  item: UmbracoItem,
  locale: Locale,
  paths: Partial<Record<Locale, string>>,
): MetadataRoute.Sitemap[number] {
  const hints = SITEMAP_HINTS[item.contentType] ?? {
    changeFrequency: "weekly" as const,
    priority: 0.5,
  };
  return {
    url: `${SITE_URL}${cleanPath(item.route.path)}`,
    lastModified: item.updateDate ? new Date(item.updateDate) : undefined,
    ...hints,
    ...(locale === "es" ? {} : { priority: hints.priority - 0.1 }),
    alternates: { languages: languages(paths) },
  };
}

/** Every published page of one language, and the code routes that go with it. */
async function pagesOf(locale: Locale) {
  // A city under construction has nothing worth indexing yet.
  const cities = (await getCities(locale)).filter(
    (city) => !isComingSoon(city),
  );
  const descendants = await Promise.all(
    cities.map((city) => getDescendants(city.route.path, undefined, locale)),
  );
  return { cities, items: [...cities, ...descendants.flat()] };
}

/**
 * Every published page in both languages, each declaring the other as its
 * alternate. Content comes straight from the CMS, so a page published later shows
 * up on the next revalidation without any code change — and a page nobody has
 * translated is listed once, under the language it exists in.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [spanish, english] = await Promise.all([pagesOf("es"), pagesOf("en")]);

  // A node keeps one id across languages, which is what pairs the two trees: the
  // paths themselves differ, since the section segments are translated too.
  const pathsById = new Map<string, Partial<Record<Locale, string>>>();
  for (const [locale, pages] of [
    ["es", spanish],
    ["en", english],
  ] as const) {
    for (const item of pages.items) {
      const paths = pathsById.get(item.id) ?? {};
      paths[locale] = item.route.path;
      pathsById.set(item.id, paths);
    }
  }

  const home: MetadataRoute.Sitemap = LOCALES.map((locale) => ({
    url: `${SITE_URL}${cleanPath(localeHref(locale, "/"))}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: locale === "es" ? 1 : 0.9,
    alternates: {
      languages: languages({
        es: localeHref("es", "/"),
        en: localeHref("en", "/"),
      }),
    },
  }));

  const contact: MetadataRoute.Sitemap = LOCALES.flatMap((locale) =>
    (locale === "es" ? spanish : english).cities.map((city) => {
      const slug = city.route.path.split("/").filter(Boolean).pop() ?? "";
      return {
        url: `${SITE_URL}${cleanPath(localeHref(locale, `/${slug}/contacto`))}`,
        changeFrequency: "yearly" as const,
        priority: 0.3,
        alternates: {
          languages: languages({
            es: localeHref("es", `/${slug}/contacto`),
            en: localeHref("en", `/${slug}/contacto`),
          }),
        },
      };
    }),
  );

  return [
    ...home,
    ...spanish.items.map((item) =>
      entry(item, "es", pathsById.get(item.id) ?? {}),
    ),
    ...english.items.map((item) =>
      entry(item, "en", pathsById.get(item.id) ?? {}),
    ),
    // Páginas de código, no contenido del CMS: se enumeran aparte.
    ...contact,
  ];
}
