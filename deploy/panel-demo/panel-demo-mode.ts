import { NextResponse } from "next/server";
import { isPanelDemoHost } from "@/lib/panel-demo-host";

const PLAYBACK_PREFIXES = [
  "/live",
  "/get.php",
  "/player_api.php",
  "/stalker_portal",
  "/c/",
  "/portal.php",
];

const MUTATION_ALLOW_PREFIXES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/license",
  "/api/health",
  "/api/panel",
];

export function isDemoPlaybackPath(pathname: string): boolean {
  return PLAYBACK_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function isDemoMutationAllowed(pathname: string, method: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  return MUTATION_ALLOW_PREFIXES.some((p) => pathname.startsWith(p));
}

export function demoModeBlockedResponse(kind: "playback" | "mutation") {
  const msg =
    kind === "playback"
      ? "Demo mode: live playback is disabled on this sandbox."
      : "Demo mode: creating or changing live content is disabled. Explore the UI read-only.";
  return NextResponse.json({ error: msg, demo: true }, { status: 403 });
}

export { isPanelDemoHost };
