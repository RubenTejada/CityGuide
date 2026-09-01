import type { MetadataRoute } from "next";
import { cleanPath, SITE_URL } from "@/lib/seo";
import { getCities, getDescendants, type UmbracoItem } from "@/lib/umbraco";

export const revalidate = 600;

/** How often each content type is expected to change, and how it ranks. */
const SITEMAP_HINTS: Record<
  string,
  { changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }
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
  article: { changeFrequency: "monthly", priority: 0.6 },
  eventItem: { changeFrequency: "daily", priority: 0.6 },
  movie: { changeFrequency: "daily", priority: 0.4 },
};

function entry(item: UmbracoItem): MetadataRoute.Sitemap[number] {
  const hints = SITEMAP_HINTS[item.contentType] ?? {
    changeFrequency: "weekly" as const,
    priority: 0.5,
  };
  return {
    url: `${SITE_URL}${cleanPath(item.route.path)}`,
    lastModified: item.updateDate ? new Date(item.updateDate) : undefined,
    ...hints,
  };
}

/**
 * Every published page, straight from the CMS — new content shows up on the
 * next revalidation without any code change.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cities = await getCities();
  const perCity = await Promise.all(
    cities.map((city) => getDescendants(city.route.path)),
  );

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...cities.map(entry),
    ...perCity.flat().map(entry),
  ];
}
