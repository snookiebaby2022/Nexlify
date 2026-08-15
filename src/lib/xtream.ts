import type { LineWithBouquets } from "./lines";
import { streamsForLineExport, lineIsPlayable } from "./lines";
import { resolveChannelId, resolveEpgId } from "./subscription-export";
import { resolveStreamPlaybackUrl } from "./resolve-stream-url";
import { exportPlaybackUrl } from "./export-playback-url";
import { getStreamPlaybackMode } from "./stream-playback-mode";
import { StreamType } from "@prisma/client";
import { prisma } from "./prisma";

function cuidToNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
import { parseBitrates, formatTimeshiftLabel } from "./stream-variants";
import {
  portFromPanelBaseUrl,
  resolvePanelListenPort,
  resolveStreamHttpsPort,
  resolveWebsiteHttpPort,
} from "./server-ports";
import { getPanelServerSettings } from "./panel-server";
import { getSettingGroup } from "./panel-settings";
import { isIpHost, pickPublicOrigin, publicOriginFromRequest } from "./public-origin";
import {
  collectCategoryAncestors,
  expandCategoryFilter,
} from "./category-tree";

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
      c.parentId && idSet.has(c.parentId) ? c.parentId : 0;
    rows.push({
      category_id: c.id,
      category_name: c.name,
      parent_id: parent,
      created_at: Math.floor(c.createdAt.getTime() / 1000).toString(),
    });
  }
  return rows;
}

export async function xtreamLiveCategoriesForLine(line: LineWithBouquets) {
  const streams = await streamsForLineExport(line);
  const live = streams.filter((s) => s.type === StreamType.LIVE);
  const categoryIds = [
    ...new Set(live.map((s) => s.categoryId).filter(Boolean) as string[]),
  ];
  return categoryRowsForIds(categoryIds, live.some((s) => !s.categoryId));
}

export async function xtreamLiveStreams(line: LineWithBouquets, baseUrl: string, categoryId?: string | null) {
  const streams = await streamsForLineExport(line);
  let live = streams.filter((s) => s.type === StreamType.LIVE);
  if (categoryId != null && categoryId !== "") {
    if (categoryId === "0") {
      live = live.filter((s) => !s.categoryId);
    } else {
      const allowed = new Set(await expandCategoryFilter(categoryId));
      live = live.filter((s) => s.categoryId && allowed.has(s.categoryId));
    }
  }
  live = sortStreamsForXc(live, await xcDefaultOrder());

  return live.map((s, i) => {
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
      category_id: s.categoryId ?? "0",
      custom_sid: full.parentStreamId ?? "",
      tv_archive: catchup || timeshiftHours > 0 ? 1 : 0,
      direct_source: direct || exportPlaybackUrl(baseUrl, line, s, full),
      tv_archive_duration: catchup ? archiveDays || timeshiftHours || 7 : timeshiftHours || 0,
      ...(abrLadder ? { abr_variants: abrLadder } : {}),
    };
  });
}

export async function xtreamVodStreams(
  line: LineWithBouquets,
  baseUrl: string,
  categoryId?: string | null
) {
  const streams = await streamsForLineExport(line);
  let movies = streams.filter((s) => s.type === StreamType.MOVIE);
  if (categoryId != null && categoryId !== "") {
    if (categoryId === "0") {
      movies = movies.filter((s) => !s.categoryId);
    } else {
      const allowed = new Set(await expandCategoryFilter(categoryId));
      movies = movies.filter((s) => s.categoryId && allowed.has(s.categoryId));
    }
  }
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
      category_id: s.categoryId ?? "0",
      container_extension: (full as { containerExtension?: string | null }).containerExtension ?? "mp4",
      custom_sid: "",
      direct_source: exportPlaybackUrl(baseUrl, line, s, full),
    };
  });
}

export async function xtreamVodCategoriesForLine(line: LineWithBouquets) {
  const streams = await streamsForLineExport(line);
  const movies = streams.filter((s) => s.type === StreamType.MOVIE);
  const categoryIds = [
    ...new Set(movies.map((s) => s.categoryId).filter(Boolean) as string[]),
  ];
  return categoryRowsForIds(categoryIds, movies.some((s) => !s.categoryId));
}

export async function xtreamSeriesForLine(line: LineWithBouquets, categoryId?: string | null) {
  const streams = await streamsForLineExport(line);
  let series = streams.filter((s) => s.type === StreamType.SERIES);
  if (categoryId != null && categoryId !== "") {
    if (categoryId === "0") {
      series = series.filter((s) => !s.categoryId);
    } else {
      const allowed = new Set(await expandCategoryFilter(categoryId));
      series = series.filter((s) => s.categoryId && allowed.has(s.categoryId));
    }
  }
  series = sortStreamsForXc(series, await xcDefaultOrder());

  return series.map((s, i) => ({
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
    category_id: s.categoryId ?? "0",
  }));
}

export async function xtreamSeriesCategoriesForLine(line: LineWithBouquets) {
  const streams = await streamsForLineExport(line);
  const series = streams.filter((s) => s.type === StreamType.SERIES);
  const categoryIds = [
    ...new Set(series.map((s) => s.categoryId).filter(Boolean) as string[]),
  ];
  return categoryRowsForIds(categoryIds, series.some((s) => !s.categoryId));
}

export async function buildM3u(line: LineWithBouquets, baseUrl: string, type: string, output: "hls" | "ts" = "ts") {
  const streams = await streamsForLineExport(line);

  const catIds = [...new Set(streams.map((s) => s.categoryId).filter(Boolean) as string[])];
  const allCatIds = catIds.length ? await collectCategoryAncestors(catIds) : [];
  const catRows = allCatIds.length
    ? await prisma.category.findMany({
        where: { id: { in: allCatIds } },
        select: { id: true, name: true, parentId: true },
      })
    : [];
  const catById = new Map(catRows.map((c) => [c.id, c]));
  const fallbackGroup = (t: StreamType) =>
    t === StreamType.LIVE ? "Live" : t === StreamType.MOVIE ? "Movies" : "Series";
  const groupTitle = (s: (typeof streams)[number]) => {
    if (!s.categoryId) return fallbackGroup(s.type);
    const cat = catById.get(s.categoryId);
    if (!cat) return fallbackGroup(s.type);
    if (cat.parentId) {
      const parent = catById.get(cat.parentId);
      if (parent) return `${parent.name} / ${cat.name}`.replace(/"/g, "'");
    }
    return cat.name.replace(/"/g, "'");
  };

  const isExtended = type === "m3u_plus";
  const lines: string[] = ["#EXTM3U"];
  for (const s of streams) {
    const full = s as typeof s & { bitrates?: unknown; streamUrl: string };
    const variants = parseBitrates(full.bitrates);
    if (s.type === StreamType.LIVE && variants.length > 1) {
      for (const v of variants) {
        lines.push(
          `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidthKbps ?? 2500000},RESOLUTION=${v.resolution ?? "1280x720"},NAME="${v.label}"`
        );
        const variantFull = v.path.startsWith("http")
          ? ({ ...full, streamUrl: v.path } as typeof full)
          : ({ ...full, streamUrl: v.path } as typeof full);
        lines.push(exportPlaybackUrl(baseUrl, line, s, variantFull, undefined, output));
      }
      continue;
    }
    const logo = isExtended && s.streamIcon ? ` tvg-logo="${s.streamIcon}"` : "";
    const tvgId = isExtended ? resolveEpgId(s) : "";
    const tvgName = s.name.replace(/"/g, "'");
    const group = groupTitle(s);
    const playUrl = exportPlaybackUrl(baseUrl, line, s, full, undefined, output);
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
