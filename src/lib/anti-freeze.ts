import { getSettingGroup } from "@/lib/panel-settings";
import { resolvePlaybackUrlForLine, type PlaybackContext } from "@/lib/line-playback";
import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";

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

async function liveStreamIdsForLine(lineId: string): Promise<string[]> {
  const line = await prisma.line.findUnique({
    where: { id: lineId },
    include: {
      bouquets: {
        include: {
          bouquet: {
            include: {
              streams: { include: { stream: true } },
            },
          },
        },
      },
    },
  });
  if (!line) return [];
  const { streamsForLineExport } = await import("@/lib/lines");
  const streams = await streamsForLineExport(line);
  return streams
    .filter((s) => s.type === StreamType.LIVE && s.isActive)
    .map((s) => s.id);
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
      const ids = await liveStreamIdsForLine(lineId);
      const targets = zapNeighborIds(ids, streamId, settings.zapPrefetchNeighbors);
      const ttl = settings.playbackUrlCacheTtlSec;
      await Promise.allSettled(
        targets.map((id) => resolvePlaybackUrlForLine(lineId, id, ctx, ttl))
      );
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
  void Promise.allSettled(
    targets.map((id) => resolvePlaybackUrlForLine(lineId, id, ctx, ttl))
  );
}
