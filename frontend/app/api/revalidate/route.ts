import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

// Called by the Umbraco webhook (seeded in CityGuideSeeder) whenever content
// is published, unpublished or deleted. Drops every cached Delivery API
// response ("umbraco" tag); pages regenerate on their next request.
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ revalidated: false }, { status: 401 });
  }

  // "max" expires the tag as far as a route handler can; updateTag (immediate)
  // is Server Actions only.
  revalidateTag("umbraco", "max");
  return NextResponse.json({ revalidated: true });
}
