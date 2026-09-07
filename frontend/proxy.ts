import { NextResponse, type NextRequest } from "next/server";

/**
 * Puts every request on a language segment. The whole app lives under `app/[lang]`,
 * but only English shows that segment in the URL: Spanish keeps the paths the portal
 * has always had — they are indexed and linked, and moving them to "/es" would throw
 * that away for nothing.
 *
 * So "/santo-domingo/restaurantes" is rewritten to "/es/santo-domingo/restaurantes"
 * without the visitor seeing it, and "/en/santo-domingo/restaurants" is already on
 * its segment and passes straight through. A request that spells the Spanish prefix
 * out is redirected to the URL without it, so a page is never reachable at two
 * addresses — which is exactly what the canonicals and the hreflang pair promise.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return NextResponse.next();
  }

  if (pathname === "/es" || pathname.startsWith("/es/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/es${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything but the framework's own paths, the API routes, the media proxied
  // from the CMS, the generated Open Graph images and anything with an extension
  // (robots.txt, sitemap.xml, the files in /public).
  matcher: ["/((?!_next/|api/|media/|opengraph-image|.*\\.).*)"],
};
