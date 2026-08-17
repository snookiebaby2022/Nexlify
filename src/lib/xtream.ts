import type { LineWithBouquets } from "./lines";
import { toXtreamAllowedOutputFormats } from "./line-access-output";
import {
  activeBouquetIds,
  categoryIdsForLine,
  streamsForLineExport,
  lineIsPlayable,
  type StreamForLine,
} from "./lines";
import { resolveChannelId, resolveEpgId } from "./subscription-export";
import { resolveStreamPlaybackUrl, type StreamWithProvider } from "./resolve-stream-url";
import { exportPlaybackUrl } from "./export-playback-url";
import { getStreamPlaybackMode } from "./stream-playback-mode";
import { xtreamTimeshiftSourceUrl } from "./timeshift-url";
import { buildTranscodeVariantLiveRows } from "./transcode-live-urls";
import { getTranscodingProfiles } from "./transcoding-profiles";
import { StreamType } from "@prisma/client";
import { prisma } from "./prisma";
import { parseBitrates, formatTimeshiftLabel } from "./stream-variants";
import {
  portFromPanelBaseUrl,
  resolvePanelListenPort,
  resolveStreamHttpsPort,
  resolveWebsiteHttpPort,
} from "./server-ports";
import { getPanelServerSettings } from "./panel-server";
import { getSettingGroup } from "./panel-settings";
import { isIpHost, pickPublicOrigin, publicOriginFromRequest, parseRequestHostHeader } from "./public-origin";
import {
  collectCategoryAncestors,
  expandCategoryFilter,
} from "./category-tree";
import {
  cuidToNum,
  resolveCategoryIdParam,
  seriesSeedsForBouquets,
  xtreamCategoryId,
} from "./xtream-stream-id";

type XcOrder = "sort_order" | "name" | "name_desc" | "added" | "added_desc";

async function xcDefaultOrder(): Promise<XcOrder> {
  const streams = await getSettingGroup("streams");
  const v = String(streams.xcDefaultOrder ?? "sort_order");
  if (v === "name" || v === "name_desc" || v === "added" || v === "added_desc" || v === "sort_order") {
    return v;
  }
  return "sort_order";
}

function sortStreamsForXc<T extends { name: string; sortOrder: number; createdAt: Date }>(
  rows: T[],
  order: XcOrder
): T[] {
  const copy = [...rows];
  switch (order) {
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "name_desc":
      return copy.sort((a, b) => b.name.localeCompare(a.name));
    case "added":
      return copy.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    case "added_desc":
      return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    default:
      return copy.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
      );
  }
}

type RequestHeaders = { get(name: string): string | null };

/** Panel + IPTV base URL (M3U live links, Xtream when served from same host). */
export function serverBaseUrl(reqUrl: string, headers?: RequestHeaders): string {
  const fromReq = publicOriginFromRequest(reqUrl, headers);
  return pickPublicOrigin(fromReq, process.env.NEXT_PUBLIC_SERVER_URL);
}

/** Client-facing website origin for server_info / streams. */
export function websiteBaseUrl(panelBaseUrl?: string): string {
  const env = process.env.NEXT_PUBLIC_WEBSITE_URL?.trim();
  if (panelBaseUrl) {
    const panel = pickPublicOrigin(
      panelBaseUrl,
      env || process.env.NEXT_PUBLIC_SERVER_URL
    ).replace(/\/+$/, "");
    if (!env) return panel;
    try {
      const p = new URL(panel);
      const w = new URL(env.includes("://") ? env : `http://${env}`);
      const websitePort = resolveWebsiteHttpPort();
      const panelPortNum = p.port
        ? Number(p.port)
        : p.protocol === "https:"
          ? 443
          : 80;
      if (websitePort === panelPortNum || websitePort === resolvePanelListenPort()) {
        return p.origin;
      }
      if (p.hostname.toLowerCase() === w.hostname.toLowerCase()) return p.origin;
      if (!isIpHost(p.hostname) && isIpHost(w.hostname)) return p.origin;
    } catch {
      return panel;
    }
    return pickPublicOrigin(env, process.env.NEXT_PUBLIC_SERVER_URL).replace(/\/+$/, "");
  }
  if (env) return pickPublicOrigin(env, process.env.NEXT_PUBLIC_SERVER_URL).replace(/\/+$/, "");
  return `http://127.0.0.1:${resolveWebsiteHttpPort()}`;
}

/** Xtream Codes / XCIPTV expect `YYYY-MM-DD HH:mm:ss` (not ISO-8601 with T/Z). */
function xtreamTimeNow(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export async function xtreamUserInfo(line: LineWithBouquets, panelBaseUrl: string) {
  const playable = lineIsPlayable(line);
  const { countLineSessions } = await import("@/lib/connections");
  const activeCons = playable ? await countLineSessions(line.id) : 0;
  const atCapacity = playable && line.maxConnections > 0 && activeCons >= line.maxConnections;
  const panelOrigin = pickPublicOrigin(
    panelBaseUrl,
    process.env.NEXT_PUBLIC_WEBSITE_URL || process.env.NEXT_PUBLIC_SERVER_URL
  ).replace(/\/+$/, "");
  let streamHost: string;
  try {
    const u = new URL(panelOrigin.includes("://") ? panelOrigin : `http://${panelOrigin}`);
    streamHost = u.hostname;
  } catch {
    streamHost = parseRequestHostHeader(panelOrigin).hostname;
  }
  // Guard against Host headers like "http://1.2.3.4" that once became url:"http"
  if (!streamHost || streamHost === "http" || streamHost === "https") {
    streamHost =
      parseRequestHostHeader(panelBaseUrl).hostname ||
      parseRequestHostHeader(panelOrigin).hostname ||
      streamHost;
  }
  const useHttps = panelOrigin.startsWith("https");
  const publicPort = portFromPanelBaseUrl(panelOrigin);
  const serverSettings = await getPanelServerSettings();
  const streamHttpsPort = serverSettings.streamHttpsPort || resolveStreamHttpsPort();
  // Smarters follows server_info.port for every API call after login. Never redirect
  // HTTPS :443 clients to :8080 — player_api is on 443 and many hosts block 8080 externally.
  const httpPort = useHttps ? String(streamHttpsPort) : publicPort;
  const httpsPort = String(streamHttpsPort);
  const now = new Date();
  return {
    user_info: {
      username: line.username,
      password: line.password,
      message: !playable
        ? "Account inactive or expired"
        : atCapacity
          ? "Max connections reached — you are using all allowed streams. Stop playback on other devices or increase your connection limit in the panel."
          : "",
      auth: playable ? 1 : 0,
      status: playable ? "Active" : "Disabled",
      exp_date: Math.floor(line.expiresAt.getTime() / 1000).toString(),
      is_trial: line.isTrial ? "1" : "0",
      active_cons: String(activeCons),
      created_at: Math.floor(line.createdAt.getTime() / 1000).toString(),
      max_connections: String(line.maxConnections),
      allowed_output_formats: toXtreamAllowedOutputFormats(line.allowedOutput),
    },
    // Keep server_info to classic Xtream keys only — extra fields break fragile XCIPTV parsers
    // (Account Info shows "--" for expire / connections / created).
    server_info: {
      url: streamHost,
      port: httpPort,
      https_port: httpsPort,
      server_protocol: useHttps ? "https" : "http",
      rtmp_port: "0",
      timezone: "UTC",
      timestamp_now: Math.floor(now.getTime() / 1000),
      time_now: xtreamTimeNow(now),
    },
  };
}

async function categoryRowsForIds(
  categoryIds: string[],
  includeUncategorized: boolean
): Promise<{ category_id: string; category_name: string; parent_id: number | string; created_at: string }[]> {
  const rows: { category_id: string; category_name: string; parent_id: number | string; created_at: string }[] = [];
  if (includeUncategorized) {
    rows.push({ category_id: "0", category_name: "Uncategorized", parent_id: 0, created_at: "0" });
  }
  if (!categoryIds.length) return rows;

  const allIds = await collectCategoryAncestors(categoryIds);

  const cats = await prisma.category.findMany({
    where: { id: { in: allIds } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  // Keep panel/SQL dump sortOrder (do not force A→Z — that breaks XUI cat_order).
  const idSet = new Set(cats.map((c) => c.id));
  for (const c of cats) {
    const parent =
      c.parentId && idSet.has(c.parentId) ? xtreamCategoryId(c.parentId) : 0;
    rows.push({
      category_id: xtreamCategoryId(c.id),
      category_name: c.name,
      parent_id: parent,
      created_at: Math.floor(c.createdAt.getTime() / 1000).toString(),
    });
  }
  return rows;
}

export async function xtreamLiveCategoriesForLine(line: LineWithBouquets) {
  const { categoryIds, hasUncategorized } = await categoryIdsForLine(line, {
    type: StreamType.LIVE,
  });
  return categoryRowsForIds(categoryIds, hasUncategorized);
}

async function streamsForXtreamList(
  line: LineWithBouquets,
  type: StreamType,
  categoryId?: string | null
): Promise<StreamForLine[]> {
  if (categoryId != null && categoryId !== "") {
    if (categoryId === "0") {
      return streamsForLineExport(line, {
        type,
        uncategorizedOnly: true,
      });
    }
    const resolved = await resolveCategoryIdParam(categoryId);
    if (!resolved || resolved === "0") return [];
    const allowed = await expandCategoryFilter(resolved);
    if (!allowed.length) return [];
    return streamsForLineExport(line, { type, categoryIds: allowed });
  }
  return streamsForLineExport(line, { type });
}

export async function xtreamLiveStreams(line: LineWithBouquets, baseUrl: string, categoryId?: string | null) {
  let live = await streamsForXtreamList(line, StreamType.LIVE, categoryId);
  live = sortStreamsForXc(live, await xcDefaultOrder());

  const rows = live.map((s, i) => {
    const full = s as typeof s & {
      provider?: { baseUrl?: string | null } | null;
      server?: { host?: string | null } | null;
      playlistUrl?: string | null;
      vodMode?: string | null;
      isOnDemand?: boolean;
      isShifted?: boolean;
      archiveDays?: number | null;
      timeshiftSeconds?: number | null;
      parentStreamId?: string | null;
      bitrates?: unknown;
      updatedAt: Date;
    };
    const playbackMode = getStreamPlaybackMode(full);
    const catchup = full.vodMode === "CATCHUP" || full.isOnDemand || full.isShifted;
    const archiveDays = full.archiveDays ?? 0;
    const timeshiftHours = full.timeshiftSeconds ? Math.ceil(full.timeshiftSeconds / 3600) : 0;
    const sourceUrl = full.playlistUrl?.trim() || full.streamUrl?.trim() || "";
    const providerTimeshift = Boolean(sourceUrl && xtreamTimeshiftSourceUrl(sourceUrl, 1, "2020-01-01:00-00"));
    const tvArchive = catchup || timeshiftHours > 0 || providerTimeshift;
    const direct =
      playbackMode === "on_demand" && full.playlistUrl?.trim()
        ? full.playlistUrl.trim()
        : "";
    const shiftLabel = formatTimeshiftLabel(full.timeshiftSeconds);
    const variants = parseBitrates(full.bitrates);
    const abrLadder =
      variants.length > 1
        ? variants.map((v) => ({
            label: v.label,
            bandwidth_kbps: v.bandwidthKbps ?? 0,
            resolution: v.resolution ?? "",
          }))
        : undefined;
    const isCreatedLive =
      playbackMode === "on_demand" || playbackMode === "created" || playbackMode === "catchup";
    return {
      num: i + 1,
      name: shiftLabel ? `${s.name} (${shiftLabel})` : s.name,
      stream_type: isCreatedLive ? "created_live" : "live",
      stream_id: cuidToNum(s.id),
      stream_icon: s.streamIcon ?? "",
      epg_channel_id: resolveEpgId(s),
      channel_id: resolveChannelId(s),
      added: Math.floor(s.createdAt.getTime() / 1000).toString(),
      updated_at: Math.floor(full.updatedAt.getTime() / 1000),
      category_id: xtreamCategoryId(s.categoryId),
      custom_sid: full.parentStreamId ?? "",
      tv_archive: tvArchive ? 1 : 0,
      direct_source: direct,
      tv_archive_duration: catchup ? archiveDays || timeshiftHours || 7 : timeshiftHours || (providerTimeshift ? 7 : 0),
      ...(abrLadder ? { abr_variants: abrLadder } : {}),
    };
  });
  const profiles = await getTranscodingProfiles();
  return buildTranscodeVariantLiveRows(live, rows, profiles);
}

export async function xtreamVodStreams(
  line: LineWithBouquets,
  baseUrl: string,
  categoryId?: string | null
) {
  let movies = await streamsForXtreamList(line, StreamType.MOVIE, categoryId);
  movies = sortStreamsForXc(movies, await xcDefaultOrder());

  return movies.map((s, i) => {
    const full = s as typeof s & {
      provider?: { baseUrl?: string | null } | null;
      playlistUrl?: string | null;
      updatedAt: Date;
    };
    return {
      num: i + 1,
      name: s.name,
      stream_type: "movie",
      stream_id: cuidToNum(s.id),
      stream_icon: s.streamIcon ?? "",
      added: Math.floor(s.createdAt.getTime() / 1000).toString(),
      updated_at: Math.floor(full.updatedAt.getTime() / 1000),
      category_id: xtreamCategoryId(s.categoryId),
      container_extension: (full as { containerExtension?: string | null }).containerExtension ?? "mp4",
      custom_sid: "",
      direct_source: exportPlaybackUrl(baseUrl, line, s, full as StreamWithProvider),
    };
  });
}

export async function xtreamVodCategoriesForLine(line: LineWithBouquets) {
  const { categoryIds, hasUncategorized } = await categoryIdsForLine(line, {
    type: StreamType.MOVIE,
  });
  return categoryRowsForIds(categoryIds, hasUncategorized);
}

/**
 * Xtream get_series — one entry per show (grouped by seriesName), not per episode.
 * Full episode dumps (~400k rows / 100MB+) time out XCIPTV / Smarters login.
 */
export async function xtreamSeriesForLine(line: LineWithBouquets, categoryId?: string | null) {
  const bouquetIds = activeBouquetIds(line, true);
  if (!bouquetIds.length) return [];

  let categoryIds: string[] | null = null;
  let uncategorizedOnly = false;
  if (categoryId != null && categoryId !== "") {
    if (categoryId === "0") {
      uncategorizedOnly = true;
    } else {
      const resolved = await resolveCategoryIdParam(categoryId);
      if (!resolved || resolved === "0") return [];
      categoryIds = await expandCategoryFilter(resolved);
      if (!categoryIds.length) return [];
    }
  }

  const seeds = await seriesSeedsForBouquets(bouquetIds, {
    categoryIds,
    uncategorizedOnly,
  });

  return seeds.map((s, i) => ({
    num: i + 1,
    name: s.name,
    series_id: cuidToNum(s.id),
    cover: s.streamIcon ?? "",
    plot: "",
    cast: "",
    director: "",
    genre: "",
    releaseDate: "",
    last_modified: Math.floor(s.updatedAt.getTime() / 1000).toString(),
    rating: "",
    rating_5based: 0,
    backdrop_path: [] as string[],
    episode_run_time: "",
    category_id: xtreamCategoryId(s.categoryId),
  }));
}

export async function xtreamSeriesCategoriesForLine(line: LineWithBouquets) {
  const { categoryIds, hasUncategorized } = await categoryIdsForLine(line, {
    type: StreamType.SERIES,
  });
  return categoryRowsForIds(categoryIds, hasUncategorized);
}

/**
 * Which stream types to include in get.php M3U exports.
 * Default m3u / m3u_plus is LIVE + MOVIE only — full catalogs with SERIES
 * routinely exceed 100MB and time out XCIPTV / TiviMate / Smarters "login".
 * Use type=series, type=all, or include_series=1 for the full dump.
 */
function m3uTypeFilter(
  type: string,
  opts?: { includeSeries?: boolean }
): StreamType | StreamType[] | undefined {
  const t = (type || "m3u_plus").toLowerCase();
  if (t === "live" || t === "m3u_live") return StreamType.LIVE;
  if (t === "movies" || t === "movie" || t === "vod" || t === "m3u_movie") {
    return StreamType.MOVIE;
  }
  if (t === "series" || t === "m3u_series") return StreamType.SERIES;
  if (t === "all" || t === "full" || t === "m3u_all") return undefined;
  if (opts?.includeSeries) return undefined;
  return [StreamType.LIVE, StreamType.MOVIE];
}

function formatM3uEntries(
  line: LineWithBouquets,
  baseUrl: string,
  streams: StreamForLine[],
  catById: Map<string, { id: string; name: string; parentId: string | null }>,
  isExtended: boolean,
  output: "hls" | "ts"
): string {
  const fallbackGroup = (t: StreamType) =>
    t === StreamType.LIVE ? "Live" : t === StreamType.MOVIE ? "Movies" : "Series";
  const groupTitle = (s: StreamForLine) => {
    if (!s.categoryId) return fallbackGroup(s.type);
    const cat = catById.get(s.categoryId);
    if (!cat) return fallbackGroup(s.type);
    if (cat.parentId) {
      const parent = catById.get(cat.parentId);
      if (parent) return `${parent.name} / ${cat.name}`.replace(/"/g, "'");
    }
    return cat.name.replace(/"/g, "'");
  };

  const lines: string[] = [];
  for (const s of streams) {
    const full = s as typeof s & { bitrates?: unknown; streamUrl: string };
    // Never emit #EXT-X-STREAM-INF in IPTV M3U — VLC/Exo/Smarters treat it as broken ABR.
    // Multi-bitrate variants stay available via XC player_api / dedicated bitrate fields.
    const logo = isExtended && s.streamIcon ? ` tvg-logo="${s.streamIcon}"` : "";
    const tvgId = isExtended ? resolveEpgId(s) : "";
    const tvgName = s.name.replace(/"/g, "'");
    const group = groupTitle(s);
    const playUrl = exportPlaybackUrl(baseUrl, line, s, full as StreamWithProvider, undefined, output);
    if (isExtended) {
      lines.push(
        `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" channel-id="${resolveChannelId(s)}"${logo} group-title="${group}",${s.name}`
      );
    } else {
      lines.push(`#EXTINF:-1,${s.name}`);
    }
    lines.push(playUrl);
  }
  return lines.join("\n");
}

/** Streaming M3U builder — safe for 100k+ catalogs (batches streams, no giant in-RAM join). */
export function buildM3uStream(
  line: LineWithBouquets,
  baseUrl: string,
  type: string,
  output: "hls" | "ts" = "ts",
  opts?: { includeSeries?: boolean }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const typeNorm = (type || "m3u_plus").toLowerCase();
  const typeFilter = m3uTypeFilter(typeNorm, opts);
  const isExtended = typeNorm === "m3u_plus" || typeNorm === "plus";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("#EXTM3U\n"));

        const { excludeDisabledFromExport } = await import("@/lib/export-policy");
        const exclude = await excludeDisabledFromExport();
        const { streamIdsForLine } = await import("./lines");
        const ids = await streamIdsForLine(line, {
          excludeDisabled: exclude,
          type: typeFilter,
        });

        const catIdSet = new Set<string>();
        // First pass: we need category names; collect while streaming by loading cats once from distinct IDs query
        const { categoryIds } = await categoryIdsForLine(line, {
          excludeDisabled: exclude,
          type: typeFilter,
        });
        for (const id of categoryIds) catIdSet.add(id);
        const allCatIds = catIdSet.size
          ? await collectCategoryAncestors([...catIdSet])
          : [];
        const catRows = allCatIds.length
          ? await prisma.category.findMany({
              where: { id: { in: allCatIds } },
              select: { id: true, name: true, parentId: true },
            })
          : [];
        const catById = new Map(catRows.map((c) => [c.id, c]));

        const BATCH = 1500;
        for (let i = 0; i < ids.length; i += BATCH) {
          const chunkIds = ids.slice(i, i + BATCH);
          const rows = await prisma.stream.findMany({
            where: { id: { in: chunkIds } },
          });
          const byId = new Map(rows.map((s) => [s.id, s as StreamForLine]));
          const streams = chunkIds
            .map((id) => byId.get(id))
            .filter((s): s is StreamForLine => Boolean(s));
          const body = formatM3uEntries(line, baseUrl, streams, catById, isExtended, output);
          if (body) controller.enqueue(encoder.encode(body + "\n"));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export async function buildM3u(
  line: LineWithBouquets,
  baseUrl: string,
  type: string,
  output: "hls" | "ts" = "ts",
  opts?: { includeSeries?: boolean }
) {
  const chunks: string[] = [];
  const stream = buildM3uStream(line, baseUrl, type, output, opts);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join("");
}
