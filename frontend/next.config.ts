import type { NextConfig } from "next";

const umbracoUrl = new URL(process.env.UMBRACO_BASE_URL ?? "http://localhost:54509");

/** The one origin the portal answers on — the same one lib/seo.ts canonicalizes to. */
const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://quehacerrd.com",
);

const nextConfig: NextConfig = {
  // Azure App Service runs the self-contained server (node server.js).
  output: "standalone",
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
