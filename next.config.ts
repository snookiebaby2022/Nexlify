import type { NextConfig } from "next";

const devOrigins = (
  process.env.ALLOWED_DEV_ORIGINS ??
  "85.17.162.54,localhost,127.0.0.1"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const cacheHeaders = [
  {
    source: '/_next/static/(.*)',
    headers: [
      {
        key: 'Cache-Control',
        value: 'public, max-age=31536000, immutable',
      },
    ],
  },
  {
    source: '/images/(.*)',
    headers: [
      {
        key: 'Cache-Control',
        value: 'public, max-age=86400, stale-while-revalidate=86400',
      },
    ],
  },
];

const distDir = process.env.NEXLIFY_DIST_DIR?.trim() || ".next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir,
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // middlewareClientMaxBodySize belongs under experimental (Next 15).
  serverExternalPackages: ["ioredis"],
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...cacheHeaders,
    ];
  },
  /** Allow accessing dev server by public IP (e.g. http://85.17.162.54:3000) */
  allowedDevOrigins: devOrigins,
  experimental: {
    serverActions: {
      // Large migration .sql uploads (Xtream/XUI/1-stream) easily exceed the
      // default limit and cause "Failed to parse body as FormData". Allow big bodies.
      bodySizeLimit: "2gb",
    },
    // The license-session middleware clones the request body before it reaches
    // Route Handlers. Its clone is capped at 10MB by default, which truncates
    // large migration uploads ("Only the first 10MB will be available"). Raise it.
    middlewareClientMaxBodySize: "2gb",
  },
};

export default nextConfig;
