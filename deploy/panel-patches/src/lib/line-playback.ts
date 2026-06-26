import { prisma } from "@/lib/prisma";
import { lineIsPlayable, type Line } from "@/lib/lines";
import { resolveStreamPlaybackUrl, type StreamWithProvider } from "@/lib/resolve-stream-url";
import { isIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { resolveIntegrationPlaybackUrl } from "@/lib/integration-playback";
import { cacheGet, cacheSet } from "@/lib/cache";
import { applyPlaybackFingerprint } from "@/lib/playback-fingerprint";
import { lineCanWatchStream } from "@/lib/line-restrictions";

export type LinePlaybackAuth = {
  id: string;
  password: string;
  status: Line["status"];
  expiresAt: Date;
  lockToIp: boolean;
  allowedIps: string | null;
  maxConnections: number;
  allowedCountries: string | null;
  blockedCountries: string | null;
  canWatchAdult: boolean;
  forcedServerId: string | null;
  allowedUserAgents?: string | null;
  disallowedUserAgents?: string | null;
};

export type PlaybackContext = {
  clientIp?: string;
  userAgent?: string;
};

export async function getLineForPlaybackAuth(username: string): Promise<LinePlaybackAuth | null> {
  const row = await prisma.line.findUnique({ where: { username } });
  if (!row) return null;
  return {
    id: row.id,
    password: row.password,
    status: row.status,
    expiresAt: row.expiresAt,
    lockToIp: row.lockToIp,
    allowedIps: row.allowedIps,
    maxConnections: row.maxConnections,
    allowedCountries: row.allowedCountries,
    blockedCountries: row.blockedCountries,
    canWatchAdult: (row as Line & { canWatchAdult?: boolean }).canWatchAdult ?? true,
    forcedServerId: row.forcedServerId,
    allowedUserAgents: (row as Line & { allowedUserAgents?: string | null }).allowedUserAgents ?? null,
    disallowedUserAgents:
      (row as Line & { disallowedUserAgents?: string | null }).disallowedUserAgents ?? null,
  };
}

/** Cached resolved URL for authorized stream (default 60s; configurable in stream settings). */
export async function resolvePlaybackUrlForLine(
  lineId: string,
  streamId: string,
  ctx?: PlaybackContext,
  cacheTtlSec?: number
): Promise<string | null> {
  let ttl = cacheTtlSec;
  if (ttl == null) {
    const { getAntiFreezeSettings } = await import("@/lib/anti-freeze");
    const settings = await getAntiFreezeSettings();
    ttl = settings.playbackUrlCacheTtlSec;
  }

  const cacheKey = `playback:url:${lineId}:${streamId}`;
  const cached = await cacheGet<string>(cacheKey);
  if (cached) return cached;

  const line = await prisma.line.findUnique({
    where: { id: lineId },
    select: { forcedServerId: true },
  });

  const stream = await prisma.stream.findFirst({
    where: {
      id: streamId,
      isActive: true,
      ...(line?.forcedServerId ? { serverId: line.forcedServerId } : {}),
      bouquets: {
        some: {
          bouquet: {
            isActive: true,
            lines: { some: { lineId } },
          },
        },
      },
    },
    include: { provider: true, server: true, category: { select: { name: true } } },
  });
  if (!stream) return null;
  if (line && !lineCanWatchStream({ canWatchAdult: true }, stream)) return null;

  const { assertRestreamAllowedForStream } = await import("@/lib/restream-policy");
  const restreamBlock = await assertRestreamAllowedForStream(stream);
  if (restreamBlock) return null;

  let url: string;
  if (isIntegrationStreamUrl(stream.streamUrl)) {
    url =
      (await resolveIntegrationPlaybackUrl(stream.streamUrl)) ??
      stream.streamUrl;
  } else {
    url = resolveStreamPlaybackUrl(
      stream as StreamWithProvider,
      `${lineId}:${stream.id}`
    );
  }
  url = await applyPlaybackFingerprint(url, {
    lineId,
    clientIp: ctx?.clientIp,
    userAgent: ctx?.userAgent,
  });
  await cacheSet(cacheKey, url, ttl);
  return url;
}

export async function resolveLivePlaybackRedirect(
  username: string,
  password: string,
  streamId: string,
  ctx?: PlaybackContext
): Promise<
  | { ok: true; lineId: string; playbackUrl: string }
  | { ok: false; reason: "auth" | "not_found" }
> {
  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password || !lineIsPlayable(line)) {
    return { ok: false, reason: "auth" };
  }
  const playbackUrl = await resolvePlaybackUrlForLine(line.id, streamId, ctx);
  if (!playbackUrl) return { ok: false, reason: "not_found" };
  return { ok: true, lineId: line.id, playbackUrl };
}
