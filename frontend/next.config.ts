import type { NextConfig } from "next";

const umbracoUrl = new URL(process.env.UMBRACO_BASE_URL ?? "http://localhost:54509");

/** The one origin the portal answers on — the same one lib/seo.ts canonicalizes to. */
const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://quehacerrd.com",
);

const nextConfig: NextConfig = {
  // Azure App Service runs the self-contained server (node server.js).
  output: "standalone",
  /**
   * Cache Components, and with it Partial Prerendering: a page is a static
   * shell with what varies per request streamed into it, instead of a route
   * that is either static or rendered from scratch on every visit. The
   * catch-all is why: it serves the thousands of places, plazas and articles
   * that read no query string *and* the listings that read one, and under the
   * previous model one `await searchParams` kept all of them out of the cache.
   * Now a listing's page and filters stream inside their own boundary and
   * everything else is prerendered at its first visit and served from the
   * cache after it.
   *
   * `partialPrefetching` stays off on purpose. It would answer an unvisited URL
   * with a generic shell before rendering it, and that shell goes out with a
   * 200: a path the CMS has no node for came back as a soft 404 — a
   * not-found page with a `noindex` in the body, cached as a page — and a real
   * one without its title in the <head>. Every deploy empties the cache, so a
   * crawler is often that first visitor. Without it the first visit renders
   * the page before answering, with its real status and its whole <head>.
   */
  cacheComponents: true,
  /**
   * The in-memory store `use cache` keeps its entries in (and the one in front
   * of the prerendered pages on disk). The 50 MB default holds a few hundred
   * rendered pages, and a city's listing of a thousand restaurants is several
   * of them on its own; the App Service plan leaves room for more.
   */
  cacheMaxMemorySize: 256 * 1024 * 1024,
  /**
   * The lifetimes the fetch layer caches with. `stale` is how long the browser's
   * router keeps a page without asking, `revalidate` when the server renders it
   * again in the background, `expire` how long a page nobody asked for may be
   * served stale at all — a year, which is what the previous model's
   * `stale-while-revalidate` said: a visitor is never kept waiting for a render.
   */
  cacheLife: {
    // The CMS and the portal's own reviews: ten minutes, the ISR period the
    // portal always had, and dropped at once by tag when an editor publishes or
    // a visitor writes.
    cms: { stale: 300, revalidate: 600, expire: 31_536_000 },
    // Caribbean Cinemas' billboard.
    cinema: { stale: 300, revalidate: 900, expire: 31_536_000 },
    // Both weather sources; the forecast moves slower than the page around it.
    weather: { stale: 300, revalidate: 1800, expire: 31_536_000 },
    // A source that did not answer. Kept long enough not to hammer it while it
    // is down and short enough that the page is whole again half a minute after
    // it is back — and no shorter: under five minutes of `expire` a cache entry
    // is a dynamic hole, and nested inside a page it would make the page one.
    unanswered: { stale: 30, revalidate: 30, expire: 300 },
  },
  // Curated attraction fallback photos are hotlinked from Wikimedia Commons.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/wikipedia/commons/**",
      },
    ],
  },
  /**
   * Every hostname the app answers on that is not the canonical one is a second
   * copy of the whole site: App Service keeps serving `*.azurewebsites.net`, the
   * DNS zone answers `www`, and plain http is answered rather than upgraded. The
   * canonical tags say which URL counts, but a crawler still has to fetch three
   * copies of five thousand pages to find that out, and links pointing at the
   * wrong host pass nothing on. So only the canonical origin answers; the rest
   * redirect to it, before anything else in the request is looked at.
   *
   * Local development matches none of these: the host is localhost and App
   * Service's `x-forwarded-proto` is not there to read.
   */
  async redirects() {
    const destination = `${siteUrl.origin}/:path*`;
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: `www.${siteUrl.hostname}` }],
        destination,
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?<app>.*)\\.azurewebsites\\.net" }],
        destination,
        permanent: true,
      },
      {
        source: "/:path*",
        has: [
          { type: "header", key: "x-forwarded-proto", value: "http" },
        ],
        destination,
        permanent: true,
      },
    ];
  },
  // Proxy the CMS nearby geo API and media files so the browser fetches
  // same-origin (no CORS, and Next's image optimizer treats media as local —
  // it refuses to fetch remote images from local IPs since Next 16).
  async rewrites() {
    return [
      {
        source: "/api/nearby",
        destination: `${umbracoUrl.origin}/api/nearby`,
      },
      {
        source: "/media/:path*",
        destination: `${umbracoUrl.origin}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
