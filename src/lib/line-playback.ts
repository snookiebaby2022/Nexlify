import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lineIsPlayable, type Line } from "@/lib/lines";
import { resolveStreamPlaybackUrl, type StreamWithProvider } from "@/lib/resolve-stream-url";
import { isIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { resolveIntegrationPlaybackUrl } from "@/lib/integration-playback";
import { cacheGet, cacheSet } from "@/lib/cache";
import { applyPlaybackFingerprint } from "@/lib/playback-fingerprint";
import { lineCanWatchStream } from "@/lib/line-restrictions";

async function preferGeoMatchedStream<T extends { id: string; serverId: string | null; name: string; type: string; epgChannelId: string | null }>(
  stream: T & { provider: unknown; server: unknown; category: { name: string } | null },
  lineId: string,
  clientIp?: string
) {
  if (!clientIp) return stream;
  if (clientIp) {
    const { pickIntelligentServer, isLbProEnabled } = await import("@/lib/intelligent-lb");
    if (await isLbProEnabled()) {
      const targetServerId = await pickIntelligentServer(clientIp);
      if (targetServerId && stream.serverId !== targetServerId) {
        const orFilters: { epgChannelId?: string; name?: string; type?: StreamType }[] = [];
        if (stream.epgChannelId) orFilters.push({ epgChannelId: stream.epgChannelId, type: stream.type as StreamType });
        orFilters.push({ name: stream.name, type: stream.type as StreamType });
        const alt = await prisma.stream.findFirst({
          where: {
            isActive: true,
            serverId: targetServerId,
            OR: orFilters,
            bouquets: {
              some: {
                bouquet: { isActive: true, lines: { some: { lineId } } },
              },
            },
          },
          include: { provider: true, server: true, category: { select: { name: true } } },
        });
        if (alt) return alt;
      }
    }
  }

  const { pickServerForClient } = await import("@/lib/server-geo-lb");
  const targetServerId = await pickServerForClient(clientIp);
  if (!targetServerId || stream.serverId === targetServerId) return stream;

  const orFilters: { epgChannelId?: string; name?: string; type?: StreamType }[] = [];
  if (stream.epgChannelId) orFilters.push({ epgChannelId: stream.epgChannelId, type: stream.type as StreamType });
  orFilters.push({ name: stream.name, type: stream.type as StreamType });

  const alt = await prisma.stream.findFirst({
    where: {
      isActive: true,
      serverId: targetServerId,
      OR: orFilters,
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
  return alt ?? stream;
}

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
    const { getCacheTtls } = await import("@/lib/cache-ttl");
    const [settings, cacheTtl] = await Promise.all([getAntiFreezeSettings(), getCacheTtls()]);
    ttl = Math.min(settings.playbackUrlCacheTtlSec, cacheTtl.playbackUrl);
  }

  const cacheKey = `playback:url:${lineId}:${streamId}`;
  const cached = await cacheGet<string>(cacheKey);
  if (cached) return cached;

  const lineRow = await prisma.line.findUnique({
    where: { id: lineId },
    select: { forcedServerId: true, canWatchAdult: true },
  });

  const stream = await prisma.stream.findFirst({
    where: {
      id: streamId,
      isActive: true,
      ...(lineRow?.forcedServerId ? { serverId: lineRow.forcedServerId } : {}),
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
  const effectiveStream = ctx?.clientIp
    ? await preferGeoMatchedStream(stream, lineId, ctx.clientIp)
    : stream;
  if (lineRow && !lineCanWatchStream({ canWatchAdult: lineRow.canWatchAdult }, effectiveStream)) return null;

  const { ensureOnDemandStreamStarted } = await import("@/lib/stream-on-demand");
  void ensureOnDemandStreamStarted(effectiveStream);

  const { assertRestreamAllowedForStream } = await import("@/lib/restream-policy");
  const restreamBlock = await assertRestreamAllowedForStream(effectiveStream);
  if (restreamBlock) return null;

  let url: string;
  if (isIntegrationStreamUrl(effectiveStream.streamUrl)) {
    url =
      (await resolveIntegrationPlaybackUrl(effectiveStream.streamUrl)) ??
      effectiveStream.streamUrl;
  } else {
    url = resolveStreamPlaybackUrl(
      effectiveStream as StreamWithProvider,
      `${lineId}:${effectiveStream.id}`
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
