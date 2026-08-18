import type { LineWithBouquets } from "./lines";
import { streamsForLineExport, lineIsPlayable } from "./lines";
import { resolveChannelId, resolveEpgId } from "./subscription-export";

import { exportPlaybackUrl } from "./export-playback-url";
import { getStreamPlaybackMode } from "./stream-playback-mode";
import { StreamType, Prisma } from "@prisma/client";
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
      allowed_output_formats: line.allowedOutput.split(","),
    },
    server_info: {
      url: streamHost,
      port: httpPort,
      https_port: httpsPort,
      server_protocol: useHttps ? "https" : "http",
      rtmp_port: "0",
      timezone: "UTC",
      timestamp_now: Math.floor(Date.now() / 1000),
      time_now: new Date().toISOString(),
      abr_auto_switch: abrAutoSwitch ? 1 : 0,
      abr_hint: abrAutoSwitch ? "client_may_switch_variants" : "",
    },
  };
}

export async function xtreamLiveCategoriesForLine(line: LineWithBouquets) {
  // Only query LIVE streams for categories (lean mode)
  const streams = await streamsForLineExport(line, { type: StreamType.LIVE, lean: true });
  const categoryIds = [
    ...new Set(streams.map((s) => s.categoryId).filter(Boolean) as string[]),
  ];

  const rows: { category_id: string; category_name: string; parent_id: number; created_at: string }[] = [];

  if (streams.some((s) => !s.categoryId)) {
    rows.push({ category_id: "0", category_name: "Uncategorized", parent_id: 0, created_at: "0" });
  }

  if (categoryIds.length) {
    const cats = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      orderBy: { sortOrder: "asc" },
    });
    for (const c of cats) {
      rows.push({ category_id: numericCategoryId(c.id), category_name: c.name, parent_id: 0, created_at: Math.floor(c.createdAt.getTime() / 1000).toString() });
    }
  }

  return rows;
}

export async function xtreamLiveStreams(line: LineWithBouquets, baseUrl: string, categoryId?: string | null) {
  // Only query LIVE streams from the database (not movies/series)
  // Use lean mode to skip provider/server joins (faster for large catalogs)
  const streams = await streamsForLineExport(line, { type: StreamType.LIVE, lean: true });
  let live = streams;
  if (categoryId != null && categoryId !== "") {
    if (categoryId === "0") {
      live = live.filter((s) => !s.categoryId);
    } else {
      live = live.filter((s) => numericCategoryId(s.categoryId) === categoryId);
    }
  }

  return live.map((s, i) => {
    const full = s;
    const playbackMode = getStreamPlaybackMode(full);
    const catchup = full.vodMode === "CATCHUP" || full.isOnDemand || full.isShifted;
    const archiveDays = full.archiveDays ?? 0;
    const timeshiftHours = full.timeshiftSeconds ? Math.ceil(full.timeshiftSeconds / 3600) : 0;
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
    const numCategoryId = numericCategoryId(s.categoryId);
    return {
      num: i + 1,
      name: shiftLabel ? `${s.name} (${shiftLabel})` : s.name,
      stream_type: isCreatedLive ? "created_live" : "live",
      stream_id: cuidToNum(s.id),
      stream_icon: s.streamIcon ?? "",
      epg_channel_id: resolveEpgId(s),
      added: Math.floor(s.createdAt.getTime() / 1000).toString(),
      category_id: numCategoryId,
      category_ids: [numCategoryId],
      custom_sid: full.parentStreamId ?? "",
      tv_archive: catchup || timeshiftHours > 0 ? 1 : 0,
      direct_source: direct || exportPlaybackUrl(baseUrl, line, s, full),
      tv_archive_duration: catchup ? archiveDays || timeshiftHours || 7 : timeshiftHours || 0,
      ...(abrLadder ? { abr_variants: abrLadder } : {}),
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
  console.log(`xtream vod ${line.username} cat=${categoryId ?? "all"} rows=${vod.length}`);

  return vod.map((s, i) => {
    const full = s;
    // Always use panel proxy URL for VOD (XUI One style) — hides provider URL
    const playUrl = exportPlaybackUrl(baseUrl, line, s, full, undefined, "auto", false);
    const numCategoryId = numericCategoryId(s.categoryId);
    return {
      num: i + 1,
      name: s.name,
      stream_type: "movie",
      stream_id: cuidToNum(s.id),
      stream_icon: s.streamIcon ?? "",
      added: Math.floor(s.createdAt.getTime() / 1000).toString(),
      updated_at: Math.floor(full.updatedAt.getTime() / 1000),
      category_id: numCategoryId,
      category_ids: [numCategoryId],
      container_extension: pickVodExtension(playUrl),
      custom_sid: "",
      direct_source: playUrl,
    };
  });
}

export async function xtreamVodCategoriesForLine(line: LineWithBouquets) {
  // Only query MOVIE streams for categories (lean mode)
  const streams = await streamsForLineExport(line, { type: StreamType.MOVIE, lean: true });
  const categoryIds = [
    ...new Set(streams.map((s) => s.categoryId).filter(Boolean) as string[]),
  ];

  const rows: { category_id: string; category_name: string; parent_id: number; created_at: string }[] = [];

  if (streams.some((s) => !s.categoryId)) {
    rows.push({ category_id: "0", category_name: "Uncategorized", parent_id: 0, created_at: "0" });
  }

  if (categoryIds.length) {
    const cats = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      orderBy: { sortOrder: "asc" },
    });
    for (const c of cats) {
      rows.push({ category_id: numericCategoryId(c.id), category_name: c.name, parent_id: 0, created_at: Math.floor(c.createdAt.getTime() / 1000).toString() });
    }
  }

  return rows;
}

export async function xtreamSeriesForLine(line: LineWithBouquets, categoryId?: string | null) {
  // Single raw-SQL pass (dedup per stream) — replaces the 292-batch ORM hydration
  // that made get_series take ~110s on the full ~437k series catalog.
  const lbs = await prisma.lineBouquet.findMany({
    where: { lineId: line.id, bouquet: { isActive: true } },
    select: { bouquetId: true },
  });
  const bouquetIds = lbs.map((lb) => lb.bouquetId);
  if (!bouquetIds.length) return [];

  // For category filtering: convert numeric categoryId back to CUID
  // The client sends the numeric ID we returned in categories, so we need to
  // reverse-map it. We build a mapping of all CUIDs → numeric IDs for this line.
  let catFilter = Prisma.empty;
  if (categoryId != null && categoryId !== "") {
    // Fetch all series category IDs for this line to build the mapping
    const allCats = await prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT s."categoryId"
      FROM "BouquetStream" bs
      INNER JOIN "Stream" s ON s.id = bs."streamId"
      WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
      AND s."isActive" = true
      AND s.type::text = 'SERIES'
      AND s."categoryId" IS NOT NULL
    `;
    const matchedCuid = allCats.find((c) => numericCategoryId(c.id) === categoryId)?.id;
    if (categoryId === "0") {
      catFilter = Prisma.sql`AND s."categoryId" IS NULL`;
    } else if (matchedCuid) {
      catFilter = Prisma.sql`AND s."categoryId" = ${matchedCuid}`;
    } else {
      return [];
    }
  }

  const rows = await prisma.$queryRaw<{ id: string; name: string; streamIcon: string | null; categoryId: string | null; updatedAt: Date }[]>`
    SELECT s.id, s.name, s."streamIcon", s."categoryId", s."updatedAt"
    FROM "BouquetStream" bs
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
    AND s."isActive" = true
    AND s.type::text = 'SERIES'
    AND s."streamUrl" NOT LIKE 'pending://%'
    AND (s."streamUrl" LIKE 'http://%' OR s."streamUrl" LIKE 'https://%')
    ${catFilter}
    GROUP BY s.id, s.name, s."streamIcon", s."categoryId", s."updatedAt"
    ORDER BY s.id
  `;

  console.log(`xtream series ${line.username} rows=${rows.length}`);

  return rows.map((s, i) => ({
    num: i + 1,
    name: s.name,
    series_id: cuidToNum(s.id),
    cover: s.streamIcon ?? "",
    last_modified: Math.floor(s.updatedAt.getTime() / 1000).toString(),
    category_id: numericCategoryId(s.categoryId),
  }));
}

export async function xtreamSeriesCategoriesForLine(line: LineWithBouquets) {
  // Only query SERIES streams for categories (lean mode)
  const streams = await streamsForLineExport(line, { type: StreamType.SERIES, lean: true });
  const categoryIds = [
    ...new Set(streams.map((s) => s.categoryId).filter(Boolean) as string[]),
  ];

  const rows: { category_id: string; category_name: string; parent_id: number; created_at: string }[] = [];

  if (streams.some((s) => !s.categoryId)) {
    rows.push({ category_id: "0", category_name: "Uncategorized", parent_id: 0, created_at: "0" });
  }

  if (categoryIds.length) {
    const cats = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      orderBy: { sortOrder: "asc" },
    });
    for (const c of cats) {
      rows.push({ category_id: numericCategoryId(c.id), category_name: c.name, parent_id: 0, created_at: Math.floor(c.createdAt.getTime() / 1000).toString() });
    }
  }

  return rows;
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
