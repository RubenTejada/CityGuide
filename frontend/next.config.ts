import type { NextConfig } from "next";

const umbracoUrl = new URL(process.env.UMBRACO_BASE_URL ?? "http://localhost:54509");

const nextConfig: NextConfig = {
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
