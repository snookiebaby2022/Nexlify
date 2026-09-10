import type { NextRequest } from "next/server";
import { getSettingGroup } from "@/lib/panel-settings";
import { verifyPlaybackFingerprint } from "@/lib/playback-fingerprint";
import { getPlaybackTokenSecret, verifyPlaybackToken } from "@/lib/playback-token";

export function playbackMarksFromUri(uri: string): { pt?: string; fp?: string } {
  const qIdx = uri.indexOf("?");
  if (qIdx < 0) return {};
  const sp = new URLSearchParams(uri.slice(qIdx + 1));
  return {
    pt: sp.get("pt") || undefined,
    fp: sp.get("fp") || undefined,
  };
}

export function playbackMarksFromRequest(req: NextRequest): { pt?: string; fp?: string } {
  const fromQuery = {
    pt: req.nextUrl.searchParams.get("pt") || undefined,
    fp: req.nextUrl.searchParams.get("fp") || undefined,
  };
  const headerUri = req.headers.get("x-original-uri") || "";
  const fromHeader = playbackMarksFromUri(headerUri);
  return {
    pt: fromQuery.pt || fromHeader.pt,
    fp: fromQuery.fp || fromHeader.fp,
  };
}

/**
 * If requirePlaybackToken is on, missing/invalid pt is denied.
 * Otherwise: if the client sent pt/fp, they must match; missing marks stay
 * allowed so Xtream /live/user/pass/id.ts keeps working.
 */
export async function rejectInvalidPlaybackMarks(
  marks: { pt?: string; fp?: string },
  ctx: { lineId: string; streamId?: string; clientIp?: string; userAgent?: string }
): Promise<"token" | "fingerprint" | null> {
  const streams = await getSettingGroup("streams");
  const requireToken = streams.requirePlaybackToken === true;

  if (requireToken || marks.pt) {
    if (!marks.pt) return requireToken ? "token" : null;
    const secret = await getPlaybackTokenSecret();
    if (!secret) return requireToken ? "token" : null;
    if (!verifyPlaybackToken(marks.pt, ctx, secret)) return "token";
  }
  if (marks.fp) {
    const fp = await getSettingGroup("fingerprint");
    if (fp.enabled && fp.secret) {
      const ok = await verifyPlaybackFingerprint(marks.fp, ctx);
      if (!ok) return "fingerprint";
    }
  }
  return null;
}
