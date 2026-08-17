import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";
import { getLineForPlaybackAuth, resolvePlaybackUrlForLine } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { cacheGet, cacheSet } from "@/lib/cache";
import { getAntiFreezeSettings } from "@/lib/anti-freeze";
import { hlsRelayCacheKey, isAllowedHlsRelayTarget, isSafeUpstreamUrl, stripLiveStreamExtension } from "@/lib/hls-playback";

export type HlsLiveAuth =
  | {
      ok: true;
      lineId: string;
      streamId: string;
      requestStreamKey: string;
      username: string;
      password: string;
      rootUpstream: string;
      userAgent?: string;
    }
  | { ok: false; status: number; message: string };

export async function authorizeHlsLiveRequest(
  req: NextRequest,
  username: string,
  password: string,
  streamId: string
): Promise<HlsLiveAuth> {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return { ok: false, status: demoBlock.status, message: "Demo blocked" };

  const cleanId = stripLiveStreamExtension(streamId);
  const requestStreamKey = cleanId;
  let resolvedStreamId = cleanId;
  if (/^\d+$/.test(cleanId)) {
    const { resolveStreamIdParam } = await import("@/lib/xtream-stream-id");
    const resolved = await resolveStreamIdParam(cleanId, { username });
    if (resolved) resolvedStreamId = resolved;
  }

  const ip = getClientIp(req);
  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password || !lineIsPlayable(line)) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  const ua = req.headers.get("user-agent") ?? undefined;
  const deny = await assertPlaybackAllowed(asPlaybackGuardLine(line), ip, ua);
  if (deny) {
    const status =
      deny === "rate" || deny === "ddos" ? 429 : deny === "connections" || deny === "ip" || deny === "kicked" ? 403 : 403;
    return {
      ok: false,
      status,
      message: deny === "kicked" ? "Session kicked" : deny,
    };
  }

  const cacheKey = hlsRelayCacheKey(line.id, resolvedStreamId);
  let rootUpstream = await cacheGet<string>(cacheKey);
  if (!rootUpstream) {
    const antiFreeze = await getAntiFreezeSettings();
    rootUpstream =
      (await resolvePlaybackUrlForLine(
        line.id,
        resolvedStreamId,
        { clientIp: ip, userAgent: ua },
        antiFreeze.playbackUrlCacheTtlSec
      )) ?? "";
    if (rootUpstream) {
      await cacheSet(cacheKey, rootUpstream, 3600);
    }
  }

  if (!rootUpstream) {
    return { ok: false, status: 404, message: "Not found" };
  }

  return {
    ok: true,
    lineId: line.id,
    streamId: resolvedStreamId,
    requestStreamKey,
    username,
    password,
    rootUpstream,
    userAgent: ua,
  };
}

export function decodeRelayTarget(encoded: string | null, rootUpstream: string): string | null {
  if (!encoded?.trim()) return null;
  let target: string;
  try {
    target = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!isSafeUpstreamUrl(target) || !isAllowedHlsRelayTarget(target, rootUpstream)) {
    return null;
  }
  return target;
}
