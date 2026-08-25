import type { LineWithBouquets } from "./lines";
import { streamsForLineExport, lineIsPlayable, categoryIdsForLine, activeBouquetIds } from "./lines";
import { resolveChannelId, resolveEpgId } from "./subscription-export";
import { exportPlaybackUrl } from "./export-playback-url";
import { StreamType } from "@prisma/client";
import { prisma } from "./prisma";
import { parseBitrates } from "./stream-variants";
import {
  xtreamSafeText,
  xtreamUnixString,
  xtreamOutputFormats,
  xtreamM3uAttr,
} from "./xtream-safe";
import { seriesSeedsForBouquets, resolveCategoryIdParam } from "./xtream-stream-id";
import { expandCategoryFilter } from "./category-tree";
import { categoryMergeKey } from "./category-options";
import {
  buildCanonicalCategoryMaps,
  canonicalNumericForCategory,
  isXtreamAllCategoryParam,
  resolveCategoryCuidsForNumericId,
} from "./xtream-category-canonical";
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
import { preferLiveOutputFormats, resolveClientPlaybackProfile } from "./client-playback-profiles";
import { mapXtreamLiveItem, mapXtreamSeriesItem, mapXtreamVodItem } from "./xtream-catalog-items";

type RequestHeaders = { get(name: string): string | null };

function lineDateMs(value: Date | string | null | undefined): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

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

export async function xtreamUserInfo(
  line: LineWithBouquets,
  panelBaseUrl: string,
  userAgent?: string | null
) {
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
  const formats = preferLiveOutputFormats(
    xtreamOutputFormats(line.allowedOutput),
    resolveClientPlaybackProfile(userAgent)
  );
  const clock = xtreamClockNow(panelTimezone, timeFormat);
  const datetimeFormat = timeFormat === "12" ? "Y-m-d h:i:s A" : "Y-m-d H:i:s";
  const websiteOrigin = websiteBaseUrl(panelOrigin);
  const epgUrl = `${websiteOrigin}/xmltv.php?username=${encodeURIComponent(line.username)}&password=${encodeURIComponent(line.password)}`;
  return {
    user_info: {
      username: line.username,
      password: line.password,
      epg_url: epgUrl,
      message: !playable
        ? "Account inactive or expired"
        : atCapacity
          ? "Max connections reached — you are using all allowed streams. Stop playback on other devices or increase your connection limit in the panel."
          : "",
      auth: playable ? 1 : 0,
      status: playable ? "Active" : "Disabled",
      exp_date: String(Math.floor(lineDateMs(line.expiresAt) / 1000)),
      is_trial: "0",
      active_cons: String(activeCons),
      created_at: String(Math.floor(lineDateMs(line.createdAt) / 1000)),
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
      epg_url: epgUrl,
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
        parent_id: 0,
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
  rawCategoryId: string,
  type: StreamType
): Promise<string[] | "uncategorized" | "missing" | "all"> {
  const categoryId = String(rawCategoryId ?? "").trim();
  if (isXtreamAllCategoryParam(categoryId)) return "all";
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

export async function resolveXtreamCategoryFilter(
  categoryId: string,
  type: StreamType
): Promise<string[] | "uncategorized" | "missing" | "all"> {
  return categoryIdsForXtreamFilter(categoryId, type);
}

export async function xtreamLiveStreams(line: LineWithBouquets, baseUrl: string, categoryId?: string | null) {
  let live;
  if (!isXtreamAllCategoryParam(categoryId)) {
    const ids = await categoryIdsForXtreamFilter(categoryId!, StreamType.LIVE);
    if (ids === "missing" || ids === "all") {
      if (ids === "missing") return [];
      live = await streamsForLineExport(line, { type: StreamType.LIVE, lean: true });
    } else {
      live = await streamsForLineExport(line, {
        type: StreamType.LIVE,
        lean: true,
        uncategorizedOnly: ids === "uncategorized",
        categoryIds: ids === "uncategorized" ? undefined : ids,
      });
    }
  } else {
    live = await streamsForLineExport(line, { type: StreamType.LIVE, lean: true });
  }

  const canonical = await buildCanonicalCategoryMaps(StreamType.LIVE);

  return live.map((s, i) => mapXtreamLiveItem(s, i, canonical));
}

export async function xtreamVodStreams(line: LineWithBouquets, _baseUrl: string, categoryId?: string | null) {
  let vod;
  if (!isXtreamAllCategoryParam(categoryId)) {
    const ids = await categoryIdsForXtreamFilter(categoryId!, StreamType.MOVIE);
    if (ids === "missing") return [];
    if (ids === "all") {
      vod = await streamsForLineExport(line, { type: StreamType.MOVIE, lean: true });
    } else {
      vod = await streamsForLineExport(line, {
        type: StreamType.MOVIE,
        lean: true,
        uncategorizedOnly: ids === "uncategorized",
        categoryIds: ids === "uncategorized" ? undefined : ids,
      });
    }
  } else {
    vod = await streamsForLineExport(line, { type: StreamType.MOVIE, lean: true });
  }

  const canonical = await buildCanonicalCategoryMaps(StreamType.MOVIE);

  return vod.map((s, i) => mapXtreamVodItem(s, i, canonical));
}

export async function xtreamVodCategoriesForLine(line: LineWithBouquets) {
  return xtreamCategoriesForType(line, StreamType.MOVIE);
}

export async function xtreamSeriesForLine(line: LineWithBouquets, categoryId?: string | null) {
  const bouquetIds = activeBouquetIds(line);
  if (!bouquetIds.length) return [];

  let seeds;
  if (!isXtreamAllCategoryParam(categoryId)) {
    const ids = await categoryIdsForXtreamFilter(categoryId!, StreamType.SERIES);
    if (ids === "missing") return [];
    if (ids === "all") {
      seeds = await seriesSeedsForBouquets(bouquetIds);
    } else {
      seeds = await seriesSeedsForBouquets(bouquetIds, {
        uncategorizedOnly: ids === "uncategorized",
        categoryIds: ids === "uncategorized" ? undefined : ids,
      });
    }
  } else {
    seeds = await seriesSeedsForBouquets(bouquetIds);
  }

  const canonical = await buildCanonicalCategoryMaps(StreamType.SERIES);

  return seeds.map((s, i) => mapXtreamSeriesItem(s, i, canonical));
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
          lean: true,
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

              const logo = isExtended && full.streamIcon ? ` tvg-logo="${xtreamM3uAttr(full.streamIcon)}"` : "";
              const tvgId = isExtended ? xtreamM3uAttr(resolveEpgId(full)) : "";
              const tvgName = xtreamM3uAttr(full.name);
              const group = xtreamM3uAttr(
                full.categoryName ||
                  (full.type === StreamType.LIVE
                    ? "Live"
                    : full.type === StreamType.MOVIE
                      ? "Movies"
                      : "Series")
              );
              const playUrl = exportPlaybackUrl(baseUrl, line, full, full, undefined, output, directPlay);
              const displayName = xtreamM3uAttr(full.name) || "Channel";

              if (isExtended) {
                batchLines.push(
                  `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" channel-id="${xtreamM3uAttr(resolveChannelId(full))}"${logo} group-title="${group}",${displayName}`
                );
              } else {
                batchLines.push(`#EXTINF:-1,${displayName}`);
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
