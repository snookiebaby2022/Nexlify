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
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // middlewareClientMaxBodySize belongs under experimental (Next 15).
  serverExternalPackages: ["ioredis", "ssh2", "cpu-features"],
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
      // Server Actions are not the SQL-dump path. Keep a hard cap against DoS
      // (GHSA-m99w-x7hq-7vfj). Large migrate uploads use Route Handlers below.
      bodySizeLimit: "100mb",
    },
    // The license-session middleware clones the request body before it reaches
    // Route Handlers. Default 10MB truncates migration uploads. Cap below 2GB.
    middlewareClientMaxBodySize: "512mb",
    ...({ proxyClientMaxBodySize: "512mb" } as Record<string, string>),
  },
};

export default nextConfig;
