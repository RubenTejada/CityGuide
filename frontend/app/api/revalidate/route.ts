import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { cdnConfigured, purgeCdnSoon } from "@/lib/cdn";

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

  const requested = request.nextUrl.searchParams.get("tag") ?? "umbraco";
  if (!TAGS.has(requested)) {
    return NextResponse.json({ revalidated: false }, { status: 400 });
  }
  // Without a CDN, "max": the next visitor is served the page as it was while
  // it is rendered again, and the one after gets the new one. With a CDN that
  // visitor is the edge, which would keep the old page for another ten
  // minutes — so the tag is expired outright, the first request after the
  // purge waits for the fresh render, and that is what the edge keeps.
  // (updateTag does the same, but only from a Server Action.)
  revalidateTag(requested, cdnConfigured() ? { expire: 0 } : "max");
  purgeCdnSoon();
  return NextResponse.json({ revalidated: true, tag: requested });
}
