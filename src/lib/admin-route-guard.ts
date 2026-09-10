import { NextRequest, NextResponse } from "next/server";
import { enforceAdminApiRateLimit } from "@/lib/api-rate-limit";

/**
 * CSRF defense-in-depth for cookie-authenticated panel APIs.
 * SameSite=lax already blocks most cross-site POSTs; Origin/Referer blocks
 * remaining cross-origin fetches that still attach cookies on some browsers.
 */
export function mutationOriginAllowed(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");
  if (!host) return false;

  const allowedHosts = new Set<string>([host.toLowerCase()]);
  for (const extra of [
    process.env.PANEL_PRIMARY_DOMAIN,
    ...(process.env.PANEL_EXTRA_DOMAINS ?? "").split(","),
  ]) {
    const h = String(extra ?? "").trim().toLowerCase();
    if (h) allowedHosts.add(h);
  }

  const checkUrl = (raw: string | null): boolean | null => {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      const h = u.host.toLowerCase();
      if (allowedHosts.has(h)) return true;
      // host header may omit default port while Origin includes it
      if (allowedHosts.has(u.hostname.toLowerCase())) return true;
      return false;
    } catch {
      return false;
    }
  };

  const fromOrigin = checkUrl(origin);
  if (fromOrigin === true) return true;
  if (fromOrigin === false) return false;

  const fromReferer = checkUrl(referer);
  if (fromReferer === true) return true;
  if (fromReferer === false) return false;

  // Same-origin XHR/fetch from older clients may omit Origin; allow missing both
  // only for non-browser tooling (curl) — browsers always send Origin on CORS POSTs.
  return !origin && !referer;
}

/**
 * Call at the top of sensitive admin/reseller API routes for Redis-backed
 * rate limiting (middleware uses a lighter in-memory guard) + CSRF origin check.
 */
export async function guardAdminApiRequest(req: NextRequest): Promise<NextResponse | null> {
  if (!mutationOriginAllowed(req)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return enforceAdminApiRateLimit(req);
}
