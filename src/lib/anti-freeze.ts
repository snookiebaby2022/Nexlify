import { getSettingGroup } from "@/lib/panel-settings";
import { resolvePlaybackUrlForLine, type PlaybackContext } from "@/lib/line-playback";
import { prisma } from "@/lib/prisma";

export type AntiFreezeSettings = {
  antiFreezeEnabled: boolean;
  fastZapEnabled: boolean;
  playbackUrlCacheTtlSec: number;
  zapPrefetchNeighbors: number;
  zapPrefetchOnLiveHit: boolean;
  zapPrefetchOnPlaylist: boolean;
};

export async function getAntiFreezeSettings(): Promise<AntiFreezeSettings> {
  const s = await getSettingGroup("streams");
  return {
    antiFreezeEnabled: s.antiFreezeEnabled !== false,
    fastZapEnabled: s.fastZapEnabled !== false,
    playbackUrlCacheTtlSec: Math.max(15, Math.min(300, Number(s.playbackUrlCacheTtlSec ?? 60))),
    zapPrefetchNeighbors: Math.max(0, Math.min(8, Number(s.zapPrefetchNeighbors ?? 3))),
    zapPrefetchOnLiveHit: s.zapPrefetchOnLiveHit !== false,
    zapPrefetchOnPlaylist: Boolean(s.zapPrefetchOnPlaylist),
  };
}

export function buildLiveRedirectHeaders(settings: AntiFreezeSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-cache, no-store",
  };
  if (settings.antiFreezeEnabled) {
    headers["X-Accel-Buffering"] = "no";
    headers["X-Nexlify-Anti-Freeze"] = "1";
  }
  if (settings.fastZapEnabled) {
    headers["X-Nexlify-Fast-Zap"] = "1";
  }
  return headers;
}

/** Neighbors in the current bouquet only — never load the full live catalog on zap. */
export async function zapNeighborIdsForLine(
  lineId: string,
  streamId: string,
  neighbors: number
): Promise<string[]> {
  if (neighbors <= 0) return [];
  const n = Math.max(1, Math.min(8, Math.floor(neighbors)));
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH bouquets AS (
      SELECT bs."bouquetId"
      FROM "LineBouquet" lb
      INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
      WHERE lb."lineId" = ${lineId} AND bs."streamId" = ${streamId}
      ORDER BY bs."sortOrder" ASC
      LIMIT 1
    ),
    ordered AS (
      SELECT s.id AS id,
             ROW_NUMBER() OVER (ORDER BY bs."sortOrder" ASC, s.id ASC) AS rn
      FROM "BouquetStream" bs
      INNER JOIN bouquets b ON b."bouquetId" = bs."bouquetId"
      INNER JOIN "Stream" s ON s.id = bs."streamId"
      WHERE s."isActive" = true AND s.type = 'LIVE'::"StreamType"
    ),
    cur AS (
      SELECT rn FROM ordered WHERE id = ${streamId} LIMIT 1
    )
    SELECT o.id
    FROM ordered o
    INNER JOIN cur ON true
    WHERE o.rn BETWEEN cur.rn - ${n} AND cur.rn + ${n}
      AND o.id <> ${streamId}
  `;
  return rows.map((r) => r.id);
}

export function zapNeighborIds(orderedIds: string[], currentId: string, neighbors: number): string[] {
  const idx = orderedIds.indexOf(currentId);
  if (idx < 0 || neighbors <= 0) return [];
  const out: string[] = [];
  for (let d = 1; d <= neighbors; d++) {
    if (idx - d >= 0) out.push(orderedIds[idx - d]!);
    if (idx + d < orderedIds.length) out.push(orderedIds[idx + d]!);
  }
  return out;
}

export function scheduleZapPrefetch(
  lineId: string,
  streamId: string,
  ctx: PlaybackContext | undefined,
  settings: AntiFreezeSettings
): void {
  if (!settings.fastZapEnabled || !settings.zapPrefetchOnLiveHit) return;
  if (settings.zapPrefetchNeighbors <= 0) return;

  void (async () => {
    try {
      const targets = await zapNeighborIdsForLine(lineId, streamId, settings.zapPrefetchNeighbors);
      const ttl = settings.playbackUrlCacheTtlSec;
      await Promise.allSettled(targets.map((id) => resolvePlaybackUrlForLine(lineId, id, ctx, ttl)));
    } catch {
      /* background warm */
    }
  })();
}

export function schedulePlaylistZapWarm(
  lineId: string,
  streamIds: string[],
  ctx: PlaybackContext | undefined,
  settings: AntiFreezeSettings,
  limit = 5
): void {
  if (!settings.fastZapEnabled || !settings.zapPrefetchOnPlaylist) return;
  const ttl = settings.playbackUrlCacheTtlSec;
  const targets = streamIds.slice(0, limit);
  void Promise.allSettled(targets.map((id) => resolvePlaybackUrlForLine(lineId, id, ctx, ttl)));
}

/**
 * Do not open extra upstream sockets during zap — that raced MPEGTS ffmpeg in Next
 * and crashed IPTV Smarters. URL cache + on-disk HLS is enough.
 */
export function schedulePlaybackUpstreamWarm(_upstreamUrl?: string, _userAgent?: string): void {
  /* no-op: extra upstream probes during channel change overload the panel */
}
