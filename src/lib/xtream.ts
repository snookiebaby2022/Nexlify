import type { LineWithBouquets } from "./lines";
import { streamsForLineExport, lineIsPlayable, categoryIdsForLine, activeBouquetIds } from "./lines";
import { resolveChannelId, resolveEpgId } from "./subscription-export";
import { exportPlaybackUrl } from "./export-playback-url";
import { StreamType } from "@prisma/client";
import { prisma } from "./prisma";
import { parseBitrates, formatTimeshiftLabel } from "./stream-variants";
import {
  xtreamSafeText,
  xtreamUnix,
  xtreamUnixString,
  xtreamOutputFormats,
  xtreamCategoryIds,
} from "./xtream-safe";
import { seriesSeedsForBouquets, resolveCategoryIdParam } from "./xtream-stream-id";
import { expandCategoryFilter } from "./category-tree";
import { categoryMergeKey } from "./category-options";
import {
  buildCanonicalCategoryMaps,
  canonicalNumericForCategory,
  resolveCategoryCuidsForNumericId,
} from "./xtream-category-canonical";
import { pickVodExtension } from "./vod-proxy";
import {
  portFromPanelBaseUrl,
  resolvePanelListenPort,
  resolveStreamHttpsPort,
  resolveWebsiteHttpPort,
} from "./server-ports";
import { formatPanelClock, normalizeTimeFormat } from "./epg-time";
import { getPanelServerSettings } from "./panel-server";
import { getSettingGroup } from "./panel-settings";
import { isIpHost, pickPublicOrigin, publicOriginFromRequest } from "./public-origin";

function cuidToNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

type RequestHeaders = { get(name: string): string | null };

function xtreamClockNow(timezone: string, timeFormat: "12" | "24"): string {
  return formatPanelClock(new Date(), { timezone, timeFormat });
}

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

export async function xtreamUserInfo(line: LineWithBouquets, panelBaseUrl: string) {
  const playable = lineIsPlayable(line);
  const { countLineSessions } = await import("@/lib/connections");
  const activeCons = playable ? await countLineSessions(line.id) : 0;
  const atCapacity = playable && line.maxConnections > 0 && activeCons >= line.maxConnections;
  const streams = await getSettingGroup("streams");
  const general = await getSettingGroup("general");
  const panelTimezone = String(general.timezone || "Europe/London");
  const timeFormat = normalizeTimeFormat(general.timeFormat);
  const abrAutoSwitch = streams.abrAutoSwitch === true;
  const panelOrigin = pickPublicOrigin(
    panelBaseUrl,
    process.env.NEXT_PUBLIC_WEBSITE_URL || process.env.NEXT_PUBLIC_SERVER_URL
  ).replace(/\/+$/, "");
  let streamHost: string;
  try {
    const u = new URL(panelOrigin.includes("://") ? panelOrigin : `http://${panelOrigin}`);
    streamHost = u.hostname;
  } catch {
    streamHost = panelOrigin.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  }
  const useHttps = panelOrigin.startsWith("https");
  const publicPort = portFromPanelBaseUrl(panelOrigin);
  const serverSettings = await getPanelServerSettings();
  const streamHttpsPort = serverSettings.streamHttpsPort || resolveStreamHttpsPort();
  // Smarters follows server_info.port for every API call after login. Never redirect
  // HTTPS :443 clients to :8080 — player_api is on 443 and many hosts block 8080 externally.
  const httpPort = useHttps ? String(streamHttpsPort) : publicPort;
  const httpsPort = String(streamHttpsPort);
  const formats = xtreamOutputFormats(line.allowedOutput);
  const clock = xtreamClockNow(panelTimezone, timeFormat);
  const datetimeFormat = timeFormat === "12" ? "Y-m-d h:i:s A" : "Y-m-d H:i:s";
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
      is_trial: "0",
      active_cons: String(activeCons),
      created_at: Math.floor(line.createdAt.getTime() / 1000).toString(),
      max_connections: line.maxConnections.toString(),
      allowed_output_formats: formats,
      allowed_outputs: formats,
    },
    server_info: {
      url: streamHost,
      port: httpPort,
      https_port: httpsPort,
      server_protocol: useHttps ? "https" : "http",
      rtmp_port: "0",
      timezone: panelTimezone,
      time_format: timeFormat,
      date_format: "Y-m-d",
      datetime_format: datetimeFormat,
      timestamp_now: Math.floor(Date.now() / 1000),
      time_now: clock,
      time: clock,
      allowed_output_formats: formats,
      abr_auto_switch: abrAutoSwitch ? 1 : 0,
      abr_hint: abrAutoSwitch ? "client_may_switch_variants" : "",
    },
  };
}

async function xtreamCategoriesForType(line: LineWithBouquets, type: StreamType) {
  const canonicalMaps = await buildCanonicalCategoryMaps(type);
  const { categoryIds, hasUncategorized } = await categoryIdsForLine(line, { type });
  const rows: { category_id: string; category_name: string; parent_id: number; created_at: string }[] = [];
  if (hasUncategorized) {
    rows.push({ category_id: "0", category_name: "Uncategorized", parent_id: 0, created_at: "0" });
  }
  if (categoryIds.length) {
    const cats = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      orderBy: { sortOrder: "asc" },
    });
    const seenMerge = new Set<string>();
    const ordered = [...cats].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
    for (const c of ordered) {
      const mergeKey = categoryMergeKey(c.name);
      if (mergeKey && seenMerge.has(mergeKey)) continue;
      const entry = mergeKey ? canonicalMaps.byMergeKey.get(mergeKey) : undefined;
      if (mergeKey) seenMerge.add(mergeKey);
      rows.push({
        category_id: entry?.numericId ?? canonicalNumericForCategory(canonicalMaps, c.id),
        category_name: xtreamSafeText(entry?.name ?? c.name) || "Category",
        parent_id: c.parentId ? cuidToNum(c.parentId) : 0,
        created_at: xtreamUnixString(c.createdAt),
      });
    }
  }
  return rows;
}

export async function xtreamLiveCategoriesForLine(line: LineWithBouquets) {
  return xtreamCategoriesForType(line, StreamType.LIVE);
}

async function categoryIdsForXtreamFilter(
  categoryId: string,
  type: StreamType
): Promise<string[] | "uncategorized" | "missing"> {
  if (categoryId === "0") return "uncategorized";
  const ids = new Set<string>();

  if (/^\d+$/.test(categoryId)) {
    const cuids = await resolveCategoryCuidsForNumericId(categoryId, type);
    if (!cuids.length) return "missing";
    for (const cuid of cuids) {
      for (const id of await expandCategoryFilter(cuid)) ids.add(id);
    }
    return ids.size ? [...ids] : "missing";
  }

  const resolved = await resolveCategoryIdParam(categoryId);
  if (!resolved) return "missing";
  if (resolved === "0") return "uncategorized";
  for (const id of await expandCategoryFilter(resolved)) ids.add(id);
  const root = await prisma.category.findUnique({
    where: { id: resolved },
    select: { name: true, categoryType: true },
  });
  if (root?.name) {
    const twins = await resolveCategoryCuidsForNumericId(
      canonicalNumericForCategory(await buildCanonicalCategoryMaps(type), resolved),
      type
    );
    for (const twin of twins) {
      for (const id of await expandCategoryFilter(twin)) ids.add(id);
    }
  }
  return ids.size ? [...ids] : "missing";
}

export async function xtreamLiveStreams(line: LineWithBouquets, baseUrl: string, categoryId?: string | null) {
  let live;
  if (categoryId != null && categoryId !== "") {
    const ids = await categoryIdsForXtreamFilter(categoryId, StreamType.LIVE);
    if (ids === "missing") return [];
    live = await streamsForLineExport(line, {
      type: StreamType.LIVE,
      lean: true,
      uncategorizedOnly: ids === "uncategorized",
      categoryIds: ids === "uncategorized" ? undefined : ids,
    });
  } else {
    live = await streamsForLineExport(line, { type: StreamType.LIVE, lean: true });
  }

  const canonical = await buildCanonicalCategoryMaps(StreamType.LIVE);

  return live.map((s, i) => {
    const catchup = s.vodMode === "CATCHUP" || s.isShifted;
    const archiveDays = s.archiveDays ?? 0;
    const timeshiftHours = s.timeshiftSeconds ? Math.ceil(s.timeshiftSeconds / 3600) : 0;
    const shiftLabel = formatTimeshiftLabel(s.timeshiftSeconds);
    const numCategoryId = canonicalNumericForCategory(canonical, s.categoryId);
    const name = xtreamSafeText(shiftLabel ? `${s.name} (${shiftLabel})` : s.name) || "Live";
    return {
      num: i + 1,
      name,
      stream_type: "live",
      stream_id: cuidToNum(s.id),
      stream_icon: xtreamSafeText(s.streamIcon),
      epg_channel_id: xtreamSafeText(resolveEpgId(s)),
      added: xtreamUnixString(s.createdAt),
      category_id: numCategoryId,
      category_ids: xtreamCategoryIds(numCategoryId),
      custom_sid: "",
      tv_archive: catchup || timeshiftHours > 0 ? 1 : 0,
      // XCIPTV builds /live/user/pass/{stream_id}.ts from stream_id. A filled
      // direct_source makes it HTTP-probe every channel during "Update media".
      direct_source: "",
      tv_archive_duration: catchup ? archiveDays || timeshiftHours || 7 : timeshiftHours || 0,
      updated_at: xtreamUnix(s.updatedAt),
    };
  });
}

export async function xtreamVodStreams(line: LineWithBouquets, baseUrl: string, categoryId?: string | null) {
  let vod;
  if (categoryId != null && categoryId !== "") {
    const ids = await categoryIdsForXtreamFilter(categoryId, StreamType.MOVIE);
    if (ids === "missing") return [];
    vod = await streamsForLineExport(line, {
      type: StreamType.MOVIE,
      lean: true,
      uncategorizedOnly: ids === "uncategorized",
      categoryIds: ids === "uncategorized" ? undefined : ids,
    });
  } else {
    vod = await streamsForLineExport(line, { type: StreamType.MOVIE, lean: true });
  }

  const streamSettings = await getSettingGroup("streams");
  const directPlay = streamSettings.vodDirectPlay !== false;
  const canonical = await buildCanonicalCategoryMaps(StreamType.MOVIE);

  return vod.map((s, i) => {
    const full = s;
    const playUrl = exportPlaybackUrl(baseUrl, line, s, full, undefined, "auto", directPlay);
    const numCategoryId = canonicalNumericForCategory(canonical, s.categoryId);
    let rating = "0";
    let rating5 = 0;
    if (full.agentStartCmd?.trim()) {
      try {
        const meta = JSON.parse(full.agentStartCmd) as { rating?: string | number; rating_5based?: number };
        if (meta.rating != null && meta.rating !== "") rating = String(meta.rating);
        if (typeof meta.rating_5based === "number" && Number.isFinite(meta.rating_5based)) {
          rating5 = meta.rating_5based;
        }
      } catch {
        /* ignore non-json agentStartCmd */
      }
    }
    return {
      num: i + 1,
      name: xtreamSafeText(s.name) || "Movie",
      stream_type: "movie",
      stream_id: cuidToNum(s.id),
      stream_icon: xtreamSafeText(s.streamIcon),
      rating,
      rating_5based: rating5,
      added: xtreamUnixString(s.createdAt),
      updated_at: xtreamUnix(full.updatedAt),
      is_adult: full.isAdult ? 1 : 0,
      category_id: numCategoryId,
      category_ids: xtreamCategoryIds(numCategoryId),
      container_extension: pickVodExtension(playUrl) || "mp4",
      custom_sid: "",
      direct_source: directPlay ? playUrl : "",
    };
  });
}

export async function xtreamVodCategoriesForLine(line: LineWithBouquets) {
  return xtreamCategoriesForType(line, StreamType.MOVIE);
}

export async function xtreamSeriesForLine(line: LineWithBouquets, categoryId?: string | null) {
  const bouquetIds = activeBouquetIds(line);
  if (!bouquetIds.length) return [];

  let seeds;
  if (categoryId != null && categoryId !== "") {
    const ids = await categoryIdsForXtreamFilter(categoryId, StreamType.SERIES);
    if (ids === "missing") return [];
    seeds = await seriesSeedsForBouquets(bouquetIds, {
      uncategorizedOnly: ids === "uncategorized",
      categoryIds: ids === "uncategorized" ? undefined : ids,
    });
  } else {
    seeds = await seriesSeedsForBouquets(bouquetIds);
  }

  const canonical = await buildCanonicalCategoryMaps(StreamType.SERIES);

  return seeds.map((s, i) => {
    const numCategoryId = canonicalNumericForCategory(canonical, s.categoryId);
    const cover = xtreamSafeText(s.streamIcon);
    const modified = xtreamUnix(s.updatedAt);
    return {
      num: i + 1,
      name: xtreamSafeText(s.name) || "Series",
      series_id: cuidToNum(s.id),
      cover,
      cover_big: cover,
      plot: "",
      cast: "",
      director: "",
      genre: "",
      releaseDate: "",
      last_modified: String(modified),
      rating: "0",
      rating_5based: 0,
      backdrop_path: [] as string[],
      youtube_trailer: "",
      episode_run_time: "0",
      category_id: numCategoryId,
      category_ids: xtreamCategoryIds(numCategoryId),
    };
  });
}

export async function xtreamSeriesCategoriesForLine(line: LineWithBouquets) {
  return xtreamCategoriesForType(line, StreamType.SERIES);
}

export async function buildM3u(line: LineWithBouquets, baseUrl: string, type: string, output: "hls" | "ts" | "auto" = "auto") {
  const chunks: string[] = [];
  const stream = buildM3uStream(line, baseUrl, type, output);
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

/**
 * Streaming M3U builder — one DB batch at a time (no full-catalog hydration).
 * Default: LIVE + VOD only (XUI m3u_plus); SERIES when include_series=1.
 */
export function buildM3uStream(
  line: LineWithBouquets,
  baseUrl: string,
  type: string,
  output: "hls" | "ts" | "auto" = "auto",
  opts?: { includeSeries?: boolean }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const isExtended = type === "m3u_plus";
  const exportTypes: StreamType[] = opts?.includeSeries
    ? [StreamType.LIVE, StreamType.MOVIE, StreamType.SERIES]
    : [StreamType.LIVE, StreamType.MOVIE];

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("#EXTM3U\n"));

        const streamSettings = await getSettingGroup("streams");
        const directPlay = streamSettings.vodDirectPlay !== false;
        const excludeDisabled = streamSettings.excludeDisabledFromExport === true;

        const { streamsForLineExport } = await import("./lines");
        await streamsForLineExport(line, {
          type: exportTypes,
          onBatch: async (chunk) => {
            const batchLines: string[] = [];
            for (const full of chunk) {
              if (excludeDisabled && !full.isActive) continue;

              const variants = parseBitrates(full.bitrates);
              if (full.type === StreamType.LIVE && variants.length > 1) {
                for (const v of variants) {
                  batchLines.push(
                    `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidthKbps ?? 2500000},RESOLUTION=${v.resolution ?? "1280x720"},NAME="${v.label}"`
                  );
                  const variantFull = { ...full, streamUrl: v.path } as typeof full;
                  batchLines.push(
                    exportPlaybackUrl(baseUrl, line, full, variantFull, undefined, output, directPlay)
                  );
                }
                continue;
              }

              const logo = isExtended && full.streamIcon ? ` tvg-logo="${full.streamIcon}"` : "";
              const tvgId = isExtended ? resolveEpgId(full) : "";
              const tvgName = full.name.replace(/"/g, "'");
              const group =
                full.type === StreamType.LIVE
                  ? "Live"
                  : full.type === StreamType.MOVIE
                    ? "Movies"
                    : "Series";
              const playUrl = exportPlaybackUrl(baseUrl, line, full, full, undefined, output, directPlay);

              if (isExtended) {
                batchLines.push(
                  `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" channel-id="${resolveChannelId(full)}"${logo} group-title="${group}",${full.name}`
                );
              } else {
                batchLines.push(`#EXTINF:-1,${full.name}`);
              }
              batchLines.push(playUrl);
            }

            if (batchLines.length) {
              controller.enqueue(encoder.encode(batchLines.join("\n") + "\n"));
            }
          },
        });

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
