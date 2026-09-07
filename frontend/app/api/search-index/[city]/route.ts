import { getItem } from "@/lib/cms";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n";
import { buildSearchIndex } from "@/lib/searchIndex";

/**
 * The city's search index, in one language. A route handler has no language segment
 * of its own to read, and the autocomplete is a client component, so the page that
 * renders it says which language to build — the index carries names and route paths,
 * and both differ between them.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ city: string }> },
) {
  const { city } = await params;
  const requested = new URL(request.url).searchParams.get("lang") ?? "";
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;

  const cityItem = await getItem(`/${city}`, undefined, locale);
  if (!cityItem || cityItem.contentType !== "city") {
    return Response.json([], { status: 404 });
  }

  const entries = await buildSearchIndex(cityItem.route.path, locale);
  return Response.json(entries, {
    headers: {
      // Browser/CDN cache; the underlying CMS fetches already use ISR.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
