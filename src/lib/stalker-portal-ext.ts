import type { LineWithBouquets } from "./lines";
import { activeBouquetIds, streamCountForLine, streamsForLineExport } from "./lines";
import { StreamType } from "@prisma/client";
import { getBinPaths } from "./bin-paths";
import { prisma } from "./prisma";

/** Ministra / XUI default page size. */
const STALKER_PAGE_SIZE = 14;
import {
  dvrPlaybackUrl,
  listDvrRecordings,
  startDvrRecording,
  stopDvrRecording,
} from "./dvr-service";
import { resolveStreamPlaybackUrl } from "./resolve-stream-url";
import { exportPlaybackUrl } from "./export-playback-url";

export const STALKER_EXTENDED_ACTIONS = new Set([
  "get_modules",
  "get_tv_modules",
  "get_genres",
  "get_tv_genres",
  "get_all_channels",
  "get_short_epg",
  "get_simple_data_table",
  "get_localization",
  "get_storages",
  "get_pvr_version",
  "get_pvr",
  "pvr_add",
  "create_pvr",
  "pvr_stop",
  "stop_pvr",
  "get_url",
  "tv_get_archive",
  "get_tv_archive",
  "get_tv_archive_day",
  "set_fav",
  "get_fav_status",
  "get_week",
  "get_epg_info",
]);

type StalkerExtra = Record<string, string>;

function stalkerModules() {
  return [
    { id: "tv", title: "TV", description: "Live TV", enabled: "1" },
    { id: "vclub", title: "Video Club", description: "Movies", enabled: "1" },
    { id: "sclub", title: "Series Club", description: "Series", enabled: "1" },
    { id: "tv_archive", title: "TV Archive", description: "Catch-up", enabled: "1" },
    { id: "pvr", title: "PVR", description: "Recordings", enabled: "1" },
    { id: "settings", title: "Settings", description: "Settings", enabled: "1" },
  ];
}

async function stalkerChannelRows(
  streams: Awaited<ReturnType<typeof streamsForLineExport>>,
  baseUrl: string,
  line: LineWithBouquets,
  page = 0
) {
  const paths = await getBinPaths();
  const prefix = `${paths.ffmpegPath.split(/[/\\]/).pop() ?? "ffmpeg"} `;
  return streams.map((s, i) => ({
    id: s.id,
    name: s.name,
    number: String(page * STALKER_PAGE_SIZE + i + 1),
    censored: s.isAdult ? 1 : 0,
    cmd: `${prefix}${s.id}`,
    cost: 0,
    count: 0,
    status: 1,
    hd: 1,
    tv_genre_id: s.categoryId ?? "0",
    logo: s.streamIcon ?? "",
    modified: "",
    hasArchive: (s.archiveDays ?? 0) > 0 ? 1 : 0,
    archive: s.archiveDays ?? 0,
    allow_pvr: 1,
    allow_local_pvr: 1,
    allow_local_timeshift: (s.timeshiftSeconds ?? 0) > 0 ? 1 : 0,
    mc_cmd: `${baseUrl}/live/${encodeURIComponent(line.username)}/${encodeURIComponent(line.password)}/${s.id}.ts`,
  }));
}

async function stalkerShortEpg(
  streams: Awaited<ReturnType<typeof streamsForLineExport>>,
  extra: StalkerExtra
) {
  const chId = extra.ch_id ?? extra.id ?? streams[0]?.id ?? "";
  const stream = streams.find((s) => s.id === chId || s.epgChannelId === chId);
  const epgId = stream?.epgChannelId ?? stream?.channelId ?? stream?.id ?? chId;
  const limit = parseInt(extra.limit ?? "4", 10);
  const now = new Date();
  const programs = await prisma.epgProgram.findMany({
    where: { channelId: epgId, stop: { gte: now } },
    orderBy: { start: "asc" },
    take: limit,
  });
  return programs.map((p) => ({
    id: p.id,
    ch_id: stream?.id ?? chId,
    name: p.title,
    descr: p.description ?? "",
    time: Math.floor(p.start.getTime() / 1000),
    time_to: Math.floor(p.stop.getTime() / 1000),
    duration: Math.max(0, Math.floor((p.stop.getTime() - p.start.getTime()) / 1000)),
    mark_archive: (stream?.archiveDays ?? 0) > 0 ? 1 : 0,
  }));
}

async function upstreamForStream(streamId: string): Promise<string | null> {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    include: { provider: true, server: true },
  });
  if (!stream) return null;
  const url = resolveStreamPlaybackUrl(stream);
  return url?.trim() || null;
}

export async function handleStalkerExtendedAction(
  action: string,
  line: LineWithBouquets,
  baseUrl: string,
  extra: StalkerExtra
): Promise<unknown | null> {
  const page = parseInt(extra.page ?? extra.p ?? "0", 10) || 0;

  switch (action) {
    case "get_modules":
    case "get_tv_modules":
      return stalkerModules();

    case "get_genres":
    case "get_tv_genres": {
      const { categoryIdsForLine } = await import("./lines");
      const { categoryIds, hasUncategorized } = await categoryIdsForLine(line, {
        type: StreamType.LIVE,
      });
      const cats = categoryIds.length
        ? await prisma.category.findMany({
            where: { id: { in: categoryIds } },
            orderBy: { sortOrder: "asc" },
          })
        : [];
      const rows = cats.map((c, i) => ({
        id: c.id,
        title: c.name,
        alias: c.id,
        censored: c.isAdult ? 1 : 0,
        number: i + 1,
      }));
      if (hasUncategorized) {
        rows.unshift({ id: "0", title: "Live TV", alias: "0", censored: 0, number: 0 });
      }
      return rows;
    }

    case "get_all_channels": {
      const total = await streamCountForLine(line, { type: StreamType.LIVE });
      const streams = await streamsForLineExport(line, {
        type: StreamType.LIVE,
        lean: true,
        offset: page * STALKER_PAGE_SIZE,
        limit: STALKER_PAGE_SIZE,
      });
      return {
        total_items: total,
        max_page_items: STALKER_PAGE_SIZE,
        data: await stalkerChannelRows(streams, baseUrl, line, page),
      };
    }

    case "get_short_epg":
    case "get_week":
    case "get_epg_info": {
      const streams = await streamsForLineExport(line, { type: StreamType.LIVE, lean: true });
      return stalkerShortEpg(streams, extra);
    }

    case "get_simple_data_table": {
      const epgStreams = await streamsForLineExport(line, { type: StreamType.LIVE, lean: true });
      const rows = await stalkerShortEpg(epgStreams, extra);
      return rows.map((r) => ({
        name: r.name,
        descr: r.descr,
        time: r.time,
        time_to: r.time_to,
      }));
    }

    case "get_localization":
      return { language: "en", timezone: "UTC", country: "US" };

    case "get_storages":
      return [{ id: "local", name: "Local DVR", storage_type: "local", status: 1 }];

    case "get_pvr_version":
      return { version: "1.0", api_version: "1.0" };

    case "get_pvr": {
      const recs = await listDvrRecordings({ lineId: line.id, take: 100 });
      return recs.map((r) => ({
        id: r.id,
        ch_id: r.streamId,
        name: r.title,
        start_time: Math.floor(r.startTime.getTime() / 1000),
        end_time: r.endTime ? Math.floor(r.endTime.getTime() / 1000) : 0,
        duration: r.durationSec,
        status: r.status.toLowerCase(),
        url: dvrPlaybackUrl(baseUrl, line.username, line.password, r.id),
      }));
    }

    case "pvr_add":
    case "create_pvr": {
      const streamId = extra.ch_id ?? extra.id ?? "";
      const stream = streamId
        ? await prisma.stream.findFirst({ where: { id: streamId, isActive: true } })
        : null;
      if (!stream) return { error: "Channel not found" };
      const durationSec = Math.max(300, parseInt(extra.duration ?? "3600", 10));
      const upstream = await upstreamForStream(stream.id);
      if (!upstream) return { error: "No upstream URL" };
      const rec = await startDvrRecording({
        streamId: stream.id,
        lineId: line.id,
        title: extra.name ?? stream.name,
        durationSec,
        upstreamUrl: upstream,
      });
      return {
        id: rec.id,
        ch_id: stream.id,
        name: rec.title,
        start_time: Math.floor(rec.startTime.getTime() / 1000),
        status: "recording",
      };
    }

    case "pvr_stop":
    case "stop_pvr": {
      const id = extra.id ?? extra.rec_id ?? "";
      if (!id) return { error: "id required" };
      await stopDvrRecording(id);
      return { ok: 1 };
    }

    case "get_url": {
      const cmd = extra.cmd ?? extra.id ?? "";
      const streamId = cmd.replace(/^ffmpeg\s+/i, "").trim();
      const bouquetIds = activeBouquetIds(line);
      const stream = streamId
        ? await prisma.stream.findFirst({
            where: {
              id: streamId,
              isActive: true,
              bouquets: bouquetIds.length
                ? { some: { bouquetId: { in: bouquetIds } } }
                : undefined,
            },
            include: {
              provider: { select: { baseUrl: true } },
              server: { select: { host: true } },
            },
          })
        : null;
      if (!stream) return { error: "Stream not found" };
      return {
        cmd: exportPlaybackUrl(
          baseUrl,
          { username: line.username, password: line.password },
          stream,
          stream
        ),
        id: stream.id,
      };
    }

    case "tv_get_archive":
    case "get_tv_archive":
    case "get_tv_archive_day": {
      const streamId = extra.ch_id ?? extra.id ?? "";
      const recs = await listDvrRecordings({ streamId: streamId || undefined, take: 50 });
      const completed = recs.filter((r) => r.status === "COMPLETED");
      return completed.map((r) => ({
        id: r.id,
        ch_id: r.streamId,
        name: r.title,
        start_time: Math.floor(r.startTime.getTime() / 1000),
        end_time: r.endTime ? Math.floor(r.endTime.getTime() / 1000) : 0,
        duration: r.durationSec,
        mark_archive: 1,
        cmd: dvrPlaybackUrl(baseUrl, line.username, line.password, r.id),
      }));
    }

    case "set_fav":
      return { status: 1 };

    case "get_fav_status":
      return { fav: 0 };

    default:
      return null;
  }
}
