import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import {
  fetchPlexJson,
  pickPlexPlaybackUrl,
  resolvePlexProfile,
  type PlexJsonMetadata,
} from "@/lib/plex-playback";
import { buildIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { linkStreamToPluginBouquet } from "@/lib/integration-bouquet";
import { maxStreamSortOrder } from "@/lib/stream-order";

export async function listIntegrations(type: "plex" | "youtube") {
  return prisma.mediaIntegration.findMany({
    where: { type },
    orderBy: { createdAt: "desc" },
  });
}

type PlexSectionResponse = {
  MediaContainer?: { Directory?: { key: string; title?: string; type?: string }[] };
};

type PlexItemMeta = {
  ratingKey?: string;
  key?: string;
  title?: string;
  type?: string;
  thumb?: string;
  grandparentTitle?: string;
  parentTitle?: string;
  parentIndex?: number;
  index?: number;
};

type PlexItemsResponse = {
  MediaContainer?: {
    Metadata?: PlexItemMeta[];
  };
};

async function upsertPluginStream(
  data: {
    name: string;
    streamUrl: string;
    type: StreamType;
    serverId?: string | null;
    streamIcon?: string | null;
    seriesName?: string | null;
    seasonNum?: number | null;
    episodeNum?: number | null;
  },
  sortOrder: number
) {
  const existing = await prisma.stream.findFirst({
    where: { streamUrl: data.streamUrl, type: data.type },
  });
  if (existing) {
    await prisma.stream.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        sortOrder,
        isActive: true,
        hostedExternally: true,
        serverId: data.serverId ?? undefined,
        streamIcon: data.streamIcon ?? undefined,
        seriesName: data.seriesName ?? undefined,
        seasonNum: data.seasonNum ?? undefined,
        episodeNum: data.episodeNum ?? undefined,
      },
    });
    await linkStreamToPluginBouquet(existing.id, sortOrder);
    return { created: false };
  }
  const stream = await prisma.stream.create({
    data: {
      ...data,
      sortOrder,
      hostedExternally: true,
      isActive: true,
    },
  });
  await linkStreamToPluginBouquet(stream.id, sortOrder);
  return { created: true };
}

async function importPlexEpisodesForShow(
  base: string,
  tokenParam: string,
  showRatingKey: string,
  showTitle: string,
  integrationId: string,
  serverId: string | null | undefined,
  sortCounter: { value: number }
) {
  let imported = 0;
  let skipped = 0;

  const leaves = await fetchPlexJson<PlexItemsResponse>(
    `${base}/library/metadata/${showRatingKey}/allLeaves?${tokenParam}&includeMeta=1`
  );
  const episodes = leaves.MediaContainer?.Metadata ?? [];

  for (const ep of episodes) {
    if (ep.type && ep.type !== "episode") continue;
    const ratingKey = ep.ratingKey ?? ep.key?.replace("/library/metadata/", "");
    if (!ratingKey) continue;

    const seasonNum = ep.parentIndex ?? 1;
    const episodeNum = ep.index ?? 1;
    const epTitle = ep.title?.trim() ?? `Episode ${episodeNum}`;
    const name = `${showTitle} — S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")} — ${epTitle} (Plex)`;
    const streamUrl = buildIntegrationStreamUrl("plex", integrationId, String(ratingKey));
    const icon = ep.thumb ? `${base}${ep.thumb}?${tokenParam}` : null;

    const r = await upsertPluginStream(
      {
        name,
        streamUrl,
        type: StreamType.SERIES,
        serverId,
        streamIcon: icon,
        seriesName: showTitle,
        seasonNum,
        episodeNum,
      },
      sortCounter.value++
    );
    if (r.created) imported++;
    else skipped++;
  }

  return { imported, skipped };
}

export async function importPlexLibrary(integrationId: string, serverId?: string | null) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "plex") throw new Error("Plex integration not found");
  const cfg = row.config as Record<string, unknown>;
  const base = String(cfg.url ?? "").replace(/\/$/, "");
  const token = String(cfg.token ?? "");
  if (!base || !token) throw new Error("Plex URL and token required");

  const tokenParam = `X-Plex-Token=${encodeURIComponent(token)}`;

  // Validate connection and load libraries
  const sections = await fetchPlexJson<PlexSectionResponse>(
    `${base}/library/sections?${tokenParam}`
  );
  const dirs = sections.MediaContainer?.Directory ?? [];
  let imported = 0;
  let skipped = 0;
  let episodes = 0;
  const sortCounter = { value: (await maxStreamSortOrder()) + 1 };
  const warnings: string[] = [];

  for (const section of dirs.slice(0, 8)) {
    if (section.type && section.type !== "movie" && section.type !== "show") continue;
    const items = await fetchPlexJson<PlexItemsResponse>(
      `${base}/library/sections/${section.key}/all?${tokenParam}&includeMeta=1`
    );
    const metadata = items.MediaContainer?.Metadata ?? [];

    for (const item of metadata.slice(0, 500)) {
      const name = item.title?.trim();
      const ratingKey = item.ratingKey ?? item.key?.replace("/library/metadata/", "");
      if (!name || !ratingKey) continue;

      const isShow = item.type === "show" || section.type === "show";
      if (isShow) {
        const epResult = await importPlexEpisodesForShow(
          base,
          tokenParam,
          String(ratingKey),
          name,
          integrationId,
          serverId,
          sortCounter
        );
        imported += epResult.imported;
        skipped += epResult.skipped;
        episodes += epResult.imported;
        continue;
      }

      const streamUrl = buildIntegrationStreamUrl("plex", integrationId, String(ratingKey));
      const icon = item.thumb ? `${base}${item.thumb}?${tokenParam}` : null;
      const r = await upsertPluginStream(
        {
          name: `${name} (Plex)`,
          streamUrl,
          type: StreamType.MOVIE,
          serverId,
          streamIcon: icon,
        },
        sortCounter.value++
      );
      if (r.created) imported++;
      else skipped++;
    }
  }

  if (dirs.length > 8) {
    warnings.push(`Only the first 8 Plex libraries were synced.`);
  }

  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { lastSync: new Date() },
  });

  return {
    imported,
    skipped,
    episodes,
    warnings: warnings.length ? warnings : undefined,
    bouquet: "Plugin imports",
  };
}

function extractYoutubeChannelId(url: string): string | null {
  const u = url.trim();
  const channelMatch = u.match(/youtube\.com\/channel\/([^/?]+)/i);
  if (channelMatch) return channelMatch[1];
  const handle = u.match(/youtube\.com\/@([^/?]+)/i);
  if (handle) return null;
  if (/^UC[\w-]{20,}$/i.test(u)) return u;
  return null;
}

async function fetchYoutubeVideoIdsFromRss(channelId: string): Promise<string[]> {
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    { signal: AbortSignal.timeout(20_000) }
  );
  if (!res.ok) return [];
  const xml = await res.text();
  const ids: string[] = [];
  const re = /<yt:videoId>([^<]+)<\/yt:videoId>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && ids.length < 40) {
    ids.push(m[1]);
  }
  return ids;
}

export async function importYoutubeSource(integrationId: string, serverId?: string | null) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "youtube") throw new Error("YouTube integration not found");
  const cfg = row.config as Record<string, unknown>;
  const channelUrl = String(cfg.channelUrl ?? cfg.url ?? "").trim();
  if (!channelUrl) throw new Error("YouTube channel URL required");

  const channelId = extractYoutubeChannelId(channelUrl);
  let imported = 0;
  const sortCounter = { value: (await maxStreamSortOrder()) + 1 };

  if (channelId) {
    const videoIds = await fetchYoutubeVideoIdsFromRss(channelId);
    for (const videoId of videoIds) {
      const streamUrl = buildIntegrationStreamUrl("youtube", integrationId, videoId);
      const r = await upsertPluginStream(
        {
          name: `${row.name} — ${videoId}`,
          streamUrl,
          type: StreamType.LIVE,
          serverId,
        },
        sortCounter.value++
      );
      if (r.created) imported++;
    }
  }

  if (imported === 0) {
    const streamUrl = buildIntegrationStreamUrl("youtube", integrationId, "channel");
    const r = await upsertPluginStream(
      {
        name: `${row.name} (YouTube)`,
        streamUrl,
        type: StreamType.LIVE,
        serverId,
      },
      sortCounter.value++
    );
    if (r.created) imported = 1;
  }

  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { lastSync: new Date() },
  });
  return { imported, bouquet: "Plugin imports" };
}

/** Resolve a playable Plex URL for integration streams (movies + episodes). */
export async function resolvePlexIntegrationPlayback(
  integrationId: string,
  itemId: string,
  cfg: Record<string, unknown>
): Promise<string | null> {
  const base = String(cfg.url ?? "").replace(/\/$/, "");
  const token = String(cfg.token ?? "");
  if (!base || !token) return null;
  const profile = resolvePlexProfile(cfg.transcodeProfile ?? "1080p");
  const tokenParam = `X-Plex-Token=${encodeURIComponent(token)}`;

  try {
    const meta = await fetchPlexJson<{
      MediaContainer?: { Metadata?: PlexJsonMetadata[] };
    }>(`${base}/library/metadata/${itemId}?${tokenParam}`);
    const item = meta.MediaContainer?.Metadata?.[0];
    if (item) {
      return pickPlexPlaybackUrl(base, token, item, profile);
    }
  } catch {
    /* fall through to transcode URL */
  }

  const { buildPlexTranscodeM3u8 } = await import("@/lib/plex-playback");
  return buildPlexTranscodeM3u8(base, token, itemId, profile);
}
