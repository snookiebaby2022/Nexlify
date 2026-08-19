import type { LineWithBouquets } from "./lines";
import { streamsForLineExport, lineIsPlayable, categoryIdsForLine, activeBouquetIds } from "./lines";
import { resolveChannelId, resolveEpgId } from "./subscription-export";

import { exportPlaybackUrl } from "./export-playback-url";
import { StreamType } from "@prisma/client";
import { prisma } from "./prisma";

function cuidToNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Xtream Codes API expects numeric category_id strings (e.g. "3").
 * Our DB uses CUIDs. This maps CUIDs → stable numeric strings.
 */
function numericCategoryId(cuid?: string | null): string {
  if (!cuid) return "0";
  return String(cuidToNum(cuid));
}

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
import { normalizeCategoryName } from "./category-options";
import { pickVodExtension } from "./vod-proxy";
import {
  portFromPanelBaseUrl,
  resolvePanelListenPort,
  resolveStreamHttpsPort,
  resolveWebsiteHttpPort,
} from "./server-ports";
import { getPanelServerSettings } from "./panel-server";
import { getSettingGroup } from "./panel-settings";
import { isIpHost, pickPublicOrigin, publicOriginFromRequest } from "./public-origin";

type RequestHeaders = { get(name: string): string | null };

function xtreamClockNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
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
  const clock = xtreamClockNow();
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
      timezone: "UTC",
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
    const seenNorm = new Set<string>();
    const ordered = [...cats].sort((a, b) => {
      const ap = a.name.includes("|") ? 0 : 1;
      const bp = b.name.includes("|") ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.sortOrder - b.sortOrder;
    });
    for (const c of ordered) {
      const norm = normalizeCategoryName(c.name);
      if (norm && seenNorm.has(norm)) continue;
      if (norm) seenNorm.add(norm);
      rows.push({
        category_id: numericCategoryId(c.id),
        category_name: xtreamSafeText(c.name) || "Category",
        parent_id: c.parentId ? cuidToNum(c.parentId) : 0,
        created_at: xtreamUnixString(c.createdAt),
      });
    }
  }
  return rows;
}

async function canonicalCategoryNumericByType(type: StreamType): Promise<Map<string, string>> {
  const categoryType = type === StreamType.MOVIE ? "MOVIE" : type === StreamType.SERIES ? "SERIES" : "LIVE";
  const cats = await prisma.category.findMany({
    where: { categoryType },
    select: { id: true, name: true },
  });
  const groups = new Map<string, { id: string; name: string }[]>();
  for (const c of cats) {
    const n = normalizeCategoryName(c.name);
    if (!n) continue;
    const list = groups.get(n) ?? [];
    list.push(c);
    groups.set(n, list);
  }
  const map = new Map<string, string>();
  for (const list of groups.values()) {
    const canonical = list.find((c) => c.name.includes("|")) ?? list[0]!;
    const num = numericCategoryId(canonical.id);
    for (const c of list) map.set(c.id, num);
  }
  return map;
}

export async function xtreamLiveCategoriesForLine(line: LineWithBouquets) {
  return xtreamCategoriesForType(line, StreamType.LIVE);
}

async function categoryIdsForXtreamFilter(categoryId: string): Promise<string[] | "uncategorized" | "missing"> {
  if (categoryId === "0") return "uncategorized";
  const resolved = await resolveCategoryIdParam(categoryId);
  if (!resolved) return "missing";
  if (resolved === "0") return "uncategorized";
  const ids = await expandCategoryFilter(resolved);
  const root = await prisma.category.findUnique({
    where: { id: resolved },
    select: { name: true, categoryType: true },
  });
  if (root?.name) {
    const n = normalizeCategoryName(root.name);
    const twins = await prisma.category.findMany({
      where: { categoryType: root.categoryType },
      select: { id: true, name: true },
    });
    for (const twin of twins) {
      if (normalizeCategoryName(twin.name) === n && !ids.includes(twin.id)) ids.push(twin.id);
    }
  }
  return ids;
}

export async function xtreamLiveStreams(line: LineWithBouquets, baseUrl: string, categoryId?: string | null) {
  let live;
  if (categoryId != null && categoryId !== "") {
    const ids = await categoryIdsForXtreamFilter(categoryId);
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

  const canonical = await canonicalCategoryNumericByType(StreamType.LIVE);

  return live.map((s, i) => {
    const catchup = s.vodMode === "CATCHUP" || s.isShifted;
    const archiveDays = s.archiveDays ?? 0;
    const timeshiftHours = s.timeshiftSeconds ? Math.ceil(s.timeshiftSeconds / 3600) : 0;
    const shiftLabel = formatTimeshiftLabel(s.timeshiftSeconds);
    const numCategoryId = (s.categoryId && canonical.get(s.categoryId)) || numericCategoryId(s.categoryId);
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
  // Only query MOVIE streams from the database
  // Use lean mode to skip provider/server joins (faster for large catalogs)
  const streams = await streamsForLineExport(line, { type: StreamType.MOVIE, lean: true });
  let vod = streams;
  if (categoryId != null && categoryId !== "") {
    vod =
      categoryId === "0"
        ? vod.filter((s) => !s.categoryId)
        : vod.filter((s) => numericCategoryId(s.categoryId) === categoryId);
  }

  const streamSettings = await getSettingGroup("streams");
  const directPlay = streamSettings.vodDirectPlay !== false;

  return vod.map((s, i) => {
    const full = s;
    const playUrl = exportPlaybackUrl(baseUrl, line, s, full, undefined, "auto", directPlay);
    const numCategoryId = numericCategoryId(s.categoryId);
    return {
      num: i + 1,
      name: xtreamSafeText(s.name) || "Movie",
      stream_type: "movie",
      stream_id: cuidToNum(s.id),
      stream_icon: xtreamSafeText(s.streamIcon),
      added: xtreamUnixString(s.createdAt),
      updated_at: xtreamUnix(full.updatedAt),
      category_id: numCategoryId,
      category_ids: xtreamCategoryIds(numCategoryId),
      container_extension: pickVodExtension(playUrl) || "mp4",
      custom_sid: "",
      direct_source: playUrl,
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
    if (categoryId === "0") {
      seeds = await seriesSeedsForBouquets(bouquetIds, { uncategorizedOnly: true });
    } else {
      const { categoryIds } = await categoryIdsForLine(line, { type: StreamType.SERIES });
      const matched = categoryIds.filter((id) => numericCategoryId(id) === categoryId);
      if (!matched.length) return [];
      seeds = await seriesSeedsForBouquets(bouquetIds, { categoryIds: matched });
    }
  } else {
    seeds = await seriesSeedsForBouquets(bouquetIds);
  }

  return seeds.map((s, i) => {
    const numCategoryId = numericCategoryId(s.categoryId);
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
 * Streaming M3U builder — processes streams in batches of 1500.
 * Never loads the entire playlist into memory (XUI/1-stream model).
 */
export function buildM3uStream(
  line: LineWithBouquets,
  baseUrl: string,
  type: string,
  output: "hls" | "ts" | "auto" = "auto",
  _opts?: { includeSeries?: boolean }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const isExtended = type === "m3u_plus";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("#EXTM3U\n"));

        const streamSettings = await getSettingGroup("streams");
        const directPlay = streamSettings.vodDirectPlay !== false;
        const excludeDisabled = streamSettings.excludeDisabledFromExport === true;

        // Get all stream IDs for this line
        const { streamsForLineExport } = await import("./lines");
        const allStreams = await streamsForLineExport(line);

        const filtered = allStreams;

        const BATCH = 1500;
        for (let i = 0; i < filtered.length; i += BATCH) {
          const chunk = filtered.slice(i, i + BATCH);
          const withProviders = await prisma.stream.findMany({
            where: { id: { in: chunk.map((s) => s.id) } },
            include: { provider: true },
          });
          const byId = new Map(withProviders.map((s) => [s.id, s]));

          const batchLines: string[] = [];
          for (const s of chunk) {
            const full = byId.get(s.id) ?? s;

            if (excludeDisabled && !full.isActive) continue;

            const variants = parseBitrates(full.bitrates);
            if (s.type === StreamType.LIVE && variants.length > 1) {
              for (const v of variants) {
                batchLines.push(
                  `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidthKbps ?? 2500000},RESOLUTION=${v.resolution ?? "1280x720"},NAME="${v.label}"`
                );
                const variantFull = { ...full, streamUrl: v.path } as typeof full;
                batchLines.push(exportPlaybackUrl(baseUrl, line, s, variantFull, undefined, output, directPlay));
              }
              continue;
            }

            const logo = isExtended && s.streamIcon ? ` tvg-logo="${s.streamIcon}"` : "";
            const tvgId = isExtended ? resolveEpgId(s) : "";
            const tvgName = s.name.replace(/"/g, "'");
            const group = s.type === StreamType.LIVE ? "Live" : s.type === StreamType.MOVIE ? "Movies" : "Series";
            const playUrl = exportPlaybackUrl(baseUrl, line, s, full, undefined, output, directPlay);

            if (isExtended) {
              batchLines.push(
                `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" channel-id="${resolveChannelId(s)}"${logo} group-title="${group}",${s.name}`
              );
            } else {
              batchLines.push(`#EXTINF:-1,${s.name}`);
            }
            batchLines.push(playUrl);
          }

          if (batchLines.length) {
            controller.enqueue(encoder.encode(batchLines.join("\n") + "\n"));
          }
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
