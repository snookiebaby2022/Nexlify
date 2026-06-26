import type { NextConfig } from "next";

const devOrigins = (
  process.env.ALLOWED_DEV_ORIGINS ??
  "85.17.162.54,localhost,127.0.0.1"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  /** Allow accessing dev server by public IP (e.g. http://85.17.162.54:3000) */
  allowedDevOrigins: devOrigins,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
