import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reverse-proxy PostHog through /ingest so anonymous error reports aren't blocked
  // by ad-blockers. (PostHog is errors-only + anonymous — see instrumentation-client.ts.)
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://eu-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/array/:path*", destination: "https://eu-assets.i.posthog.com/array/:path*" },
      { source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" },
    ];
  },
  skipTrailingSlashRedirect: true,
  images: {
    // User caricature avatars are stored as public Vercel Blob objects.
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],
  },
  async headers() {
    return [
      {
        // The browser must always re-fetch the worker so SW updates ship.
        // (The Cache Storage the SW manages is separate from this HTTP cache.)
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
