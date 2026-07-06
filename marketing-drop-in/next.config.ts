// marketing-drop-in/next.config.ts
import type { NextConfig } from "next";
import path from "path";
import { MARKETING_SECURITY_HEADERS } from "./src/lib/security-headers";

const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // ✅ FIX #1: scope tracing to THIS project, not the parent
  //    (the parent directory is a different Next.js app)
  ...(isVercel
    ? {}
    : { outputFileTracingRoot: __dirname }),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...MARKETING_SECURITY_HEADERS,
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/opengraph-image",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, s-maxage=86400" },
        ],
      },
      {
        source: "/twitter-image",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, s-maxage=86400" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/docs/api", destination: "/install", permanent: true },
      { source: "/login", destination: "/", permanent: false },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.nexlify.live" }],
        destination: "https://nexlify.live/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/lp/:path*",
          has: [{ type: "query", key: "format", value: "markdown" }],
          destination: "/api/markdown/lp/:path*",
        },
        { source: "/og/home.jpg", destination: "/opengraph-image" },
        { source: "/og/og-preview.jpg", destination: "/opengraph-image" },
      ],
    };
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
    inlineCss: true,
  },
};

export default nextConfig;
