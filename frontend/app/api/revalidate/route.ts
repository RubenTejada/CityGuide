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

  // Expired outright, not marked stale: with "max" the next visitor of every page
  // was served the version from before the publish while it regenerated in the
  // background — and that regeneration read the nested Delivery API caches, stale
  // too, so a city page went on listing yesterday's articles for hours. A page
  // few people visit has no second visitor to pay for the first. updateTag
  // would do the same, but it is Server Actions only.
  const requested = request.nextUrl.searchParams.get("tag") ?? "umbraco";
  if (!TAGS.has(requested)) {
    return NextResponse.json({ revalidated: false }, { status: 400 });
  }
  revalidateTag(requested, { expire: 0 });
  return NextResponse.json({ revalidated: true, tag: requested });
}
