import type { NextRequest } from "next/server";
import { secretsEqual } from "@/lib/secrets-equal";

/** True when the request is an authorized internal call (not spoofable via X-Forwarded-For alone). */
export function isAuthorizedInternalRequest(req: NextRequest): boolean {
  const internalSecret = process.env.PANEL_INTERNAL_SECRET?.trim();
  if (internalSecret) {
    const provided =
      req.headers.get("x-panel-internal-secret") ??
      req.headers.get("x-panel-api-key");
    return secretsEqual(provided, internalSecret);
  }

  // Production: never accept shared marketing API keys on internal-only routes.
  if (process.env.NODE_ENV === "production") return false;

  const fallback =
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    process.env.PANEL_API_SECRET?.trim();
  if (fallback) {
    const provided =
      req.headers.get("x-panel-internal-secret") ??
      req.headers.get("x-panel-api-key");
    return secretsEqual(provided, fallback);
  }

  return !req.headers.get("x-forwarded-for") && !req.headers.get("x-real-ip");
}
