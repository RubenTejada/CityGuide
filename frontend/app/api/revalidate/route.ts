import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

// Called by the CMS (FrontendRevalidator) whenever content is published,
// unpublished or deleted, which drops every cached Delivery API response
// ("umbraco"), and when an editor hides a review or blocks its author, which
// drops the cached reviews and ratings (`?tag=reviews`). Pages regenerate on
// their next request.
const TAGS = new Set(["umbraco", "reviews"]);

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ revalidated: false }, { status: 401 });
  }

  // "max" expires the tag as far as a route handler can; updateTag (immediate)
  // is Server Actions only.
  const requested = request.nextUrl.searchParams.get("tag") ?? "umbraco";
  if (!TAGS.has(requested)) {
    return NextResponse.json({ revalidated: false }, { status: 400 });
  }
  revalidateTag(requested, "max");
  return NextResponse.json({ revalidated: true, tag: requested });
}
