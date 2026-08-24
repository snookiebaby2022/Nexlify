import type { NextResponse } from "next/server";

/** Baseline security headers for panel HTML and JSON responses. */
export function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  if (
    process.env.PANEL_FULL_SSL === "1" ||
    process.env.PANEL_FORCE_HTTPS === "1" ||
    process.env.PANEL_FORCE_HTTPS === "true"
  ) {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return res;
}
