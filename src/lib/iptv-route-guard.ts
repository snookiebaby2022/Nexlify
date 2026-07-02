import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  demoModeBlockedResponse,
  isDemoPlaybackPath,
  isPanelDemoHost,
} from "@/lib/panel-demo-mode";

/** Block IPTV playback on the public demo sandbox (.php routes skip middleware). */
export function rejectDemoIptvPlayback(req: NextRequest): NextResponse | null {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!isPanelDemoHost(host)) return null;
  const path = req.nextUrl.pathname;
  if (isDemoPlaybackPath(path) || path.startsWith("/movie/")) {
    return demoModeBlockedResponse("playback");
  }
  return null;
}
