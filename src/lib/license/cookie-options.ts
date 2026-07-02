import type { NextRequest } from "next/server";

/** HTTP panels (no TLS) must not use Secure cookies or the browser drops the license session. */
export function licenseCookieSecure(req?: NextRequest): boolean {
  if (process.env.NEXLIFY_LICENSE_COOKIE_SECURE === "0") return false;
  if (req) {
    const forwarded = req.headers.get("x-forwarded-proto");
    if (forwarded) {
      return forwarded.split(",")[0]?.trim() === "https";
    }
    return req.nextUrl.protocol === "https:";
  }
  return process.env.NEXLIFY_LICENSE_COOKIE_SECURE === "1";
}
