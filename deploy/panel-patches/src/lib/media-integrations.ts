import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import {
  fetchPlexJson,
  resolvePlexProfile,
} from "@/lib/plex-playback";
import { buildIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { linkStreamToPluginBouquet } from "@/lib/integration-bouquet";

export async function listIntegrations(type: "plex" | "youtube") {
  return prisma.mediaIntegration.findMany({
    where: { type },
    orderBy: { createdAt: "desc" },
  });
}

type PlexSectionResponse = {
  MediaContainer?: { Directory?: { key: string; title?: string; type?: string }[] };
};

type PlexItemsResponse = {
  MediaContainer?: {
    Metadata?: {
      ratingKey?: string;
      key?: string;
      title?: string;
      type?: string;
      thumb?: string;
    }[];
  };
};

async function upsertPluginStream(data: {
  name: string;
  streamUrl: string;
  type: StreamType;
  serverId?: string | null;
  streamIcon?: string | null;
}) {
  const existing = await prisma.stream.findFirst({
    where: { streamUrl: data.streamUrl, type: data.type },
  });
  if (existing) {
    await prisma.stream.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        isActive: true,
        hostedExternally: true,
        serverId: data.serverId ?? undefined,
        streamIcon: data.streamIcon ?? undefined,
      },
    });
    await linkStreamToPluginBouquet(existing.id);
    return { created: false };
  }
  const stream = await prisma.stream.create({
    data: {
      ...data,
      hostedExternally: true,
      isActive: true,
    },
  });
  await linkStreamToPluginBouquet(stream.id);
  return { created: true };
}

export async function importPlexLibrary(integrationId: string, serverId?: string | null) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== "plex") throw new Error("Plex integration not found");
  const cfg = row.config as Record<string, unknown>;
  const base = String(cfg.url ?? "").replace(/\/$/, "");
  const token = String(cfg.token ?? "");
  if (!base || !token) throw new Error("Plex URL and token required");

  const tokenParam = `X-Plex-Token=${encodeURIComponent(token)}`;
  const sections = await fetchPlexJson<PlexSectionResponse>(
    `${base}/library/sections?${tokenParam}`
  );
  const dirs = sections.MediaContainer?.Directory ?? [];
  let imported = 0;
  let skipped = 0;

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

      const streamUrl = buildIntegrationStreamUrl("plex", integrationId, String(ratingKey));
      const type =
        item.type === "show" || section.type === "show" ? StreamType.SERIES : StreamType.MOVIE;
      const icon = item.thumb ? `${base}${item.thumb}?${tokenParam}` : null;
      const r = await upsertPluginStream({
        name: `${name} (Plex)`,
        streamUrl,
        type,
        serverId,
        streamIcon: icon,
      });
      if (r.created) imported++;
      else skipped++;
    }
  }

  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { lastSync: new Date() },
  });
  return { imported, skipped, bouquet: "Plugin imports" };
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

  if (channelId) {
    const videoIds = await fetchYoutubeVideoIdsFromRss(channelId);
    for (const videoId of videoIds) {
      const streamUrl = buildIntegrationStreamUrl("youtube", integrationId, videoId);
      const r = await upsertPluginStream({
        name: `${row.name} — ${videoId}`,
        streamUrl,
        type: StreamType.LIVE,
        serverId,
      });
      if (r.created) imported++;
    }
  }

  if (imported === 0) {
    const streamUrl = buildIntegrationStreamUrl("youtube", integrationId, "channel");
    const r = await upsertPluginStream({
      name: `${row.name} (YouTube)`,
      streamUrl,
      type: StreamType.LIVE,
      serverId,
    });
    if (r.created) imported = 1;
  }

  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { lastSync: new Date() },
  });
  return { imported, bouquet: "Plugin imports" };
}
