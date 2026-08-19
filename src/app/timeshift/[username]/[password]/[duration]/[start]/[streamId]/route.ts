import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { isSessionKicked, attachKickAwareProxyBody } from "@/lib/connections";
import { getLineForPlaybackAuth, resolvePlaybackUrlCandidatesForLine } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { iptvCorsPreflight, iptvText, withIptvCors } from "@/lib/iptv-cors";
import { checkLineUserAgent } from "@/lib/line-restrictions";
import { openUpstreamLiveStream, upstreamToWebResponse } from "@/lib/live-upstream-proxy";
import { parseTimeshiftStart, xtreamTimeshiftSourceUrl } from "@/lib/timeshift-url";
import { stripLiveStreamExtension } from "@/lib/hls-playback";
import { getSettingGroup } from "@/lib/panel-settings";
import { prisma } from "@/lib/prisma";
import { createReadStream, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return iptvCorsPreflight();
}

/**
 * Xtream/XUI catch-up:
 * /timeshift/{user}/{pass}/{durationMinutes}/{start}/{streamId}.ts
 * start = YYYY-MM-DD:HH-MM or unix seconds
 */
export async function GET(
  req: NextRequest,
  ctx: {
    params: Promise<{
      username: string;
      password: string;
      duration: string;
      start: string;
      streamId: string;
    }>;
  }
) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;

  const { username, password, duration, start, streamId } = await ctx.params;
  let cleanId = stripLiveStreamExtension(streamId);
  const ip = getClientIp(req);

  if (/^\d+$/.test(cleanId)) {
    const { resolveStreamIdParam } = await import("@/lib/xtream-stream-id");
    const resolved = await resolveStreamIdParam(cleanId, { username });
    if (resolved) cleanId = resolved;
  }

  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password) return iptvText("Unauthorized", { status: 401 });
  if (!lineIsPlayable(line)) return iptvText("Unauthorized", { status: 403 });

  const ua = req.headers.get("user-agent") ?? undefined;
  if (!checkLineUserAgent(line, ua)) return iptvText("User-Agent not allowed for this line", { status: 403 });
  if (await isSessionKicked(line.id, ip)) return iptvText("Session kicked", { status: 403 });

  const catchup = await getSettingGroup("catchup");
  const durationMin = Math.max(1, Math.min(Number(duration) || 1, 24 * 60));
  const startAt = parseTimeshiftStart(start);

  const stream = await prisma.stream.findUnique({
    where: { id: cleanId },
    select: { archiveDays: true, timeshiftSeconds: true, vodMode: true, isShifted: true },
  });
  const allowed =
    catchup.catchupEnabled === true ||
    (stream?.archiveDays ?? 0) > 0 ||
    (stream?.timeshiftSeconds ?? 0) > 0 ||
    stream?.vodMode === "CATCHUP" ||
    stream?.isShifted === true;
  if (!allowed) {
    return iptvText("Catch-up is not enabled for this channel", { status: 404 });
  }

  const storage = String(catchup.catchupStoragePath || "/var/catchup");
  const local = findLocalArchive(storage, cleanId, startAt);
  if (local) {
    const node = createReadStream(local);
    const web = Readable.toWeb(node) as unknown as BodyInit;
    return withIptvCors(
      new NextResponse(web, {
        status: 200,
        headers: { "Content-Type": "video/mp2t", "Cache-Control": "no-cache" },
      })
    );
  }

  const candidates = await resolvePlaybackUrlCandidatesForLine(line.id, cleanId, {
    clientIp: ip,
    userAgent: ua,
  });
  for (const liveUrl of candidates) {
    const tsUrl = xtreamTimeshiftSourceUrl(liveUrl, durationMin, start);
    if (!tsUrl) continue;
    try {
      const open = await openUpstreamLiveStream(tsUrl, {
        userAgent: "VLC/3.0.20 LibVLC/3.0.20",
        timeoutMs: 15_000,
      });
      const { stream: body, headers } = upstreamToWebResponse(open);
      const tracked = attachKickAwareProxyBody({
        body: body as unknown as ReadableStream<Uint8Array>,
        lineId: line.id,
        streamId: cleanId,
        ip: ip ?? "",
        userAgent: ua,
      });
      return withIptvCors(
        new NextResponse(tracked as unknown as BodyInit, { status: 200, headers })
      );
    } catch {
      continue;
    }
  }

  return iptvText("Timeshift archive not available", { status: 404 });
}

function findLocalArchive(root: string, streamId: string, startAt: Date | null): string | null {
  const dir = join(root, streamId.replace(/[^a-zA-Z0-9_-]/g, ""));
  if (!existsSync(dir)) return null;
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => /\.(ts|mp4|mkv)$/i.test(f));
  } catch {
    return null;
  }
  if (!files.length) return null;
  const withTime = files
    .map((f) => {
      const p = join(dir, f);
      let m = 0;
      try {
        m = statSync(p).mtimeMs;
      } catch {
        m = 0;
      }
      const unix = f.match(/(\d{10,13})/);
      if (unix) m = Number(unix[1].length > 10 ? unix[1] : Number(unix[1]) * 1000);
      return { p, m };
    })
    .sort((a, b) => a.m - b.m);
  if (!startAt) return withTime[withTime.length - 1]?.p ?? null;
  const target = startAt.getTime();
  let best = withTime[0]!;
  for (const row of withTime) {
    if (row.m <= target) best = row;
  }
  return best.p;
}
