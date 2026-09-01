import { buildSearchIndex } from "@/lib/search";
import { getItem } from "@/lib/umbraco";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ city: string }> },
) {
  const { city } = await params;
  const cityItem = await getItem(`/${city}`);
  if (!cityItem || cityItem.contentType !== "city") {
    return Response.json([], { status: 404 });
  }

  const entries = await buildSearchIndex(cityItem.route.path);
  return Response.json(entries, {
    headers: {
      // Browser/CDN cache; the underlying CMS fetches already use ISR.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
