import type { NextRequest } from "next/server";

/** True when the request is an authorized internal call (not spoofable via X-Forwarded-For alone). */
export function isAuthorizedInternalRequest(req: NextRequest): boolean {
  const secret =
    process.env.PANEL_INTERNAL_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    process.env.PANEL_API_SECRET?.trim();
  if (secret) {
    const provided =
      req.headers.get("x-panel-internal-secret") ??
      req.headers.get("x-panel-api-key");
    return provided === secret;
  }
  if (process.env.NODE_ENV === "production") return false;
  return !req.headers.get("x-forwarded-for") && !req.headers.get("x-real-ip");
}
