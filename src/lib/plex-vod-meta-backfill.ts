import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { plexVodMetaFromItem } from "@/lib/plex-catalog-match";
import { encodeVodAgentCmd, parseXtreamVodMeta } from "@/lib/vod-meta";
import { ensurePlexAccess } from "@/lib/media-integrations";
import { fetchPlexJson } from "@/lib/plex-playback";
import { plexTokenParam } from "@/lib/plex-config";

type PlexMetaItem = {
  type?: string;
  summary?: string;
  year?: number | string;
  rating?: number | string;
  audienceRating?: number | string;
  originallyAvailableAt?: string;
  duration?: number;
  studio?: string;
  Genre?: unknown;
  Role?: unknown;
  Director?: unknown;
  grandparentRatingKey?: string;
};

/**
 * Fill empty Xtream plot/cast/genre from Plex metadata (movies + series episodes).
 * Small batches — called from minute cron so apps pick up info without a full re-sync.
 */
export async function backfillPlexVodMeta(limit = 30): Promise<number> {
  const cap = Math.min(80, Math.max(0, limit));
  if (!cap) return 0;

  const rows = await prisma.stream.findMany({
    where: {
      isActive: true,
      type: { in: [StreamType.MOVIE, StreamType.SERIES] },
      streamUrl: { startsWith: "nexlify://plex/" },
      OR: [{ agentStartCmd: null }, { agentStartCmd: "" }],
    },
    select: { id: true, type: true, streamUrl: true, seriesName: true },
    take: cap,
    orderBy: { updatedAt: "asc" },
  });
  if (!rows.length) return 0;

  const accessByIntegration = new Map<string, Awaited<ReturnType<typeof ensurePlexAccess>>>();
  let updated = 0;

  for (const row of rows) {
    const parsed = parseIntegrationStreamUrl(row.streamUrl ?? "");
    if (parsed?.type !== "plex") continue;
    try {
      let access = accessByIntegration.get(parsed.integrationId);
      if (!access) {
        access = await ensurePlexAccess(parsed.integrationId);
        accessByIntegration.set(parsed.integrationId, access);
      }
      const tokenParam = plexTokenParam(access.cfg);
      const meta = await fetchPlexJson<{ MediaContainer?: { Metadata?: PlexMetaItem[] } }>(
        `${access.base}/library/metadata/${parsed.itemId}?${tokenParam}`,
        access.clientIdentifier
      );
      let item = meta.MediaContainer?.Metadata?.[0];
      if (item?.type === "episode" && item.grandparentRatingKey) {
        const show = await fetchPlexJson<{ MediaContainer?: { Metadata?: PlexMetaItem[] } }>(
          `${access.base}/library/metadata/${item.grandparentRatingKey}?${tokenParam}`,
          access.clientIdentifier
        );
        item = show.MediaContainer?.Metadata?.[0] ?? item;
      }
      if (!item) continue;
      const cmd = encodeVodAgentCmd(plexVodMetaFromItem(item));
      const plot = String(parseXtreamVodMeta(cmd).plot ?? "").trim();
      if (!plot && !String(parseXtreamVodMeta(cmd).genre ?? "").trim()) continue;

      if (row.type === StreamType.SERIES && row.seriesName?.trim()) {
        const res = await prisma.stream.updateMany({
          where: {
            type: StreamType.SERIES,
            seriesName: { equals: row.seriesName, mode: "insensitive" },
            streamUrl: { startsWith: `nexlify://plex/${parsed.integrationId}/` },
            OR: [{ agentStartCmd: null }, { agentStartCmd: "" }],
          },
          data: { agentStartCmd: cmd },
        });
        updated += res.count;
      } else {
        await prisma.stream.update({ where: { id: row.id }, data: { agentStartCmd: cmd } });
        updated += 1;
      }
    } catch {
      /* skip this rating key */
    }
  }
  return updated;
}
