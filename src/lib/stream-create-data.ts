import path from "path";
import type { StreamType, VodMode } from "@prisma/client";
import { prisma } from "./prisma";
import { resolveSourceToStreamUrl, getMediaImportRoot } from "./import-media";
import { resolveProviderUrl } from "./vod-provider-url";
import { syncVodModeFields } from "./resolve-stream-url";
import { normalizeStreamSource } from "./stream-source";
import { parseStreamAdvancedFields } from "./stream-fields";
import { categoryForMovie, categoryForSeries } from "./vod-category";
import { enrichVodFromTmdb } from "./vod-tmdb-enrich";

export type StreamCreateInput = {
  name: string;
  type?: StreamType | string;
  source?: string;
  streamUrl?: string;
  streamIcon?: string | null;
  serverId?: string | null;
  categoryId?: string | null;
  epgChannelId?: string | null;
  channelId?: string | null;
  minSpeedKbps?: number | null;
  maxSpeedKbps?: number | null;
  seriesName?: string | null;
  seasonNum?: number | null;
  episodeNum?: number | null;
  containerExtension?: string | null;
  isOnDemand?: boolean;
  vodMode?: VodMode | string;
  archiveDays?: number | null;
  backupUrl?: string | null;
  playlistUrl?: string | null;
  providerId?: string | null;
  providerPath?: string | null;
  hostedExternally?: boolean;
  timeshiftSeconds?: number | null;
  isShifted?: boolean;
  parentStreamId?: string | null;
  dnsRotator?: unknown;
  bitrates?: unknown;
  agentStartCmd?: string | null;
};

export async function buildStreamCreateData(body: StreamCreateInput) {
  const type = (body.type ?? "LIVE") as StreamType;
  const { isOnDemand, vodMode } = syncVodModeFields(body);

  let hostedExternally = Boolean(body.hostedExternally);
  let providerId = body.providerId || null;
  let providerPath = body.providerPath?.trim() || null;
  let streamUrl = "";
  let absolutePath: string | undefined;

  if (body.hostedExternally === false) {
    providerId = null;
    providerPath = null;
    hostedExternally = false;
  }

  if (providerId && providerPath) {
    const provider = await prisma.streamProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new Error("Selected provider not found");
    if (!provider.isActive) throw new Error("Selected provider is disabled");
    streamUrl = resolveProviderUrl(provider, providerPath);
    hostedExternally = true;
  } else {
    const rawSource = normalizeStreamSource(String(body.source ?? body.streamUrl ?? ""));
    if (!rawSource && type !== "LIVE") {
      throw new Error("Source or provider path is required");
    }
    if (rawSource) {
      const resolved = resolveSourceToStreamUrl(rawSource, getMediaImportRoot());
      streamUrl = resolved.streamUrl;
      absolutePath = resolved.absolutePath;
    } else {
      streamUrl = normalizeStreamSource(String(body.streamUrl ?? ""));
    }
    providerId = null;
    providerPath = null;
    hostedExternally = false;
  }

  const containerExtension =
    body.containerExtension ||
    (absolutePath ? path.extname(absolutePath).replace(".", "") : null) ||
    (streamUrl.startsWith("file://")
      ? path.extname(streamUrl.replace(/^file:\/\//, "")).replace(".", "")
      : "mp4");

  let serverId = body.serverId || null;
  if (!serverId && type === "LIVE") {
    const { pickLeastLoadedServerId } = await import("@/lib/server-load");
    serverId = await pickLeastLoadedServerId();
  }

  let streamIcon = body.streamIcon?.trim() || null;
  let agentStartCmd = body.agentStartCmd ? String(body.agentStartCmd) : null;
  let categoryId = body.categoryId || null;
  let displayName = body.name;

  if (type === "MOVIE" || type === "SERIES") {
    const enrichment = await enrichVodFromTmdb(
      body.name,
      type,
      body.seriesName
    );
    if (enrichment) {
      if (!streamIcon && enrichment.streamIcon) streamIcon = enrichment.streamIcon;
      if (!agentStartCmd) agentStartCmd = enrichment.agentStartCmd;
      if (enrichment.title && type === "MOVIE") displayName = enrichment.title;
      if (!categoryId) {
        const genre = enrichment.genreNames[0];
        categoryId =
          type === "SERIES"
            ? await categoryForSeries(body.seriesName, genre)
            : await categoryForMovie(genre);
      }
    } else if (!categoryId) {
      categoryId =
        type === "SERIES"
          ? await categoryForSeries(body.seriesName)
          : await categoryForMovie();
    }
  }

  if (!streamIcon && type === "LIVE") {
    const { resolveAutoChannelLogo } = await import("@/lib/channel-logo");
    streamIcon = await resolveAutoChannelLogo(body.name, { epgChannelId: body.epgChannelId });
  }

  return {
    data: {
      name: displayName,
      streamUrl,
      streamIcon,
      type,
      serverId,
      agentStartCmd,
      categoryId,
      epgChannelId: body.epgChannelId || null,
      channelId: body.channelId || null,
      minSpeedKbps: body.minSpeedKbps != null ? Number(body.minSpeedKbps) : null,
      maxSpeedKbps: body.maxSpeedKbps != null ? Number(body.maxSpeedKbps) : null,
      seriesName: body.seriesName || null,
      seasonNum: body.seasonNum != null ? Number(body.seasonNum) : null,
      episodeNum: body.episodeNum != null ? Number(body.episodeNum) : null,
      containerExtension,
      isOnDemand,
      vodMode,
      archiveDays: body.archiveDays != null ? Number(body.archiveDays) : null,
      backupUrl: body.backupUrl?.trim() || null,
      playlistUrl: body.playlistUrl?.trim() || null,
      providerId,
      providerPath,
      hostedExternally,
      ...parseStreamAdvancedFields(body as Record<string, unknown>),
    },
    absolutePath,
  };
}
