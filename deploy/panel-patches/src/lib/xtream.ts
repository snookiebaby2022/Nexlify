import type { LineWithBouquets } from "./lines";
import { streamsForLineExport, lineIsPlayable } from "./lines";
import { resolveChannelId, resolveEpgId } from "./subscription-export";
import { resolveStreamPlaybackUrl } from "./resolve-stream-url";
import { exportPlaybackUrl } from "./export-playback-url";
import { StreamType } from "@prisma/client";
import { prisma } from "./prisma";
import { parseBitrates, formatTimeshiftLabel } from "./stream-variants";
import {
  resolveStreamEdgeHttpPort,
  resolveStreamHttpsPort,
  resolveWebsiteHttpPort,
  resolvePanelListenPort,
} from "./server-ports";
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

export function xtreamUserInfo(line: LineWithBouquets, panelBaseUrl: string) {
  const playable = lineIsPlayable(line);
  const panelOrigin = pickPublicOrigin(
    panelBaseUrl,
    process.env.NEXT_PUBLIC_WEBSITE_URL || process.env.NEXT_PUBLIC_SERVER_URL
  );
  let streamHost: string;
  let httpPort = resolveStreamEdgeHttpPort();
  const httpsPort = resolveStreamHttpsPort();
  try {
    const u = new URL(panelOrigin);
    streamHost = u.hostname;
    if (u.port) httpPort = Number(u.port);
  } catch {
    streamHost = panelOrigin.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  }
  const useHttps = panelOrigin.startsWith("https");
  return {
    user_info: {
      username: line.username,
      password: line.password,
      message: playable ? "" : "Account inactive or expired",
      auth: playable ? 1 : 0,
      status: playable ? "Active" : "Disabled",
      exp_date: Math.floor(line.expiresAt.getTime() / 1000).toString(),
      is_trial: "0",
      active_cons: "0",
      created_at: Math.floor(line.createdAt.getTime() / 1000).toString(),
      max_connections: line.maxConnections.toString(),
      allowed_output_formats: line.allowedOutput.split(","),
    },
    server_info: {
      url: streamHost,
      port: String(httpPort),
      https_port: String(httpsPort),
      server_protocol: useHttps ? "https" : "http",
      rtmp_port: "0",
      timezone: "UTC",
      timestamp_now: Math.floor(Date.now() / 1000),
      time_now: new Date().toISOString(),
    },
  };
}

export async function xtreamLiveStreams(line: LineWithBouquets) {
  const streams = await streamsForLineExport(line);
  const live = streams.filter((s) => s.type === StreamType.LIVE);
  const withProviders = await prisma.stream.findMany({
    where: { id: { in: live.map((s) => s.id) } },
    include: { provider: true, server: true },
  });
  const byId = new Map(withProviders.map((s) => [s.id, s]));

  return live.map((s, i) => {
    const full = byId.get(s.id) ?? s;
    const catchup = full.vodMode === "CATCHUP" || full.isOnDemand || full.isShifted;
    const archiveDays = full.archiveDays ?? 0;
    const timeshiftHours = full.timeshiftSeconds ? Math.ceil(full.timeshiftSeconds / 3600) : 0;
    const direct = full.vodMode === "ON_DEMAND" ? resolveStreamPlaybackUrl(full) : "";
    const shiftLabel = formatTimeshiftLabel(full.timeshiftSeconds);
    return {
      num: i + 1,
      name: shiftLabel ? `${s.name} (${shiftLabel})` : s.name,
      stream_type: full.vodMode === "ON_DEMAND" ? "created_live" : "live",
      stream_id: s.id,
      stream_icon: s.streamIcon ?? "",
      epg_channel_id: resolveEpgId(s),
      channel_id: resolveChannelId(s),
      added: Math.floor(s.createdAt.getTime() / 1000).toString(),
      category_id: s.categoryId ?? "0",
      custom_sid: full.parentStreamId ?? "",
      tv_archive: catchup || timeshiftHours > 0 ? 1 : 0,
      direct_source: direct,
      tv_archive_duration: catchup ? archiveDays || timeshiftHours || 7 : timeshiftHours || 0,
    };
  });
}

export async function xtreamVodStreams(line: LineWithBouquets, baseUrl: string) {
  const streams = await streamsForLineExport(line);
  const movies = streams.filter((s) => s.type === StreamType.MOVIE);
  const withProviders = await prisma.stream.findMany({
    where: { id: { in: movies.map((s) => s.id) } },
    include: { provider: true },
  });
  const byId = new Map(withProviders.map((s) => [s.id, s]));

  return movies.map((s, i) => {
    const full = byId.get(s.id) ?? s;
    return {
      num: i + 1,
      name: s.name,
      stream_type: "movie",
      stream_id: s.id,
      stream_icon: s.streamIcon ?? "",
      added: Math.floor(s.createdAt.getTime() / 1000).toString(),
      category_id: s.categoryId ?? "0",
      container_extension: full.containerExtension ?? "mp4",
      custom_sid: "",
      direct_source: exportPlaybackUrl(baseUrl, line, s, full),
    };
  });
}

export async function buildM3u(line: LineWithBouquets, baseUrl: string, type: string) {
  const streams = await streamsForLineExport(line);
  const withProviders = await prisma.stream.findMany({
    where: { id: { in: streams.map((s) => s.id) } },
    include: { provider: true },
  });
  const byId = new Map(withProviders.map((s) => [s.id, s]));

  const lines: string[] = ["#EXTM3U"];
  for (const s of streams) {
    const full = byId.get(s.id) ?? s;
    const variants = parseBitrates(full.bitrates);
    if (s.type === StreamType.LIVE && variants.length > 1) {
      lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${variants[0].bandwidthKbps ?? 5000000},RESOLUTION=${variants[0].resolution ?? "1920x1080"},NAME="${variants[0].label}"`);
      lines.push(resolveStreamPlaybackUrl(full));
      for (const v of variants.slice(1)) {
        lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidthKbps ?? 2500000},RESOLUTION=${v.resolution ?? "1280x720"},NAME="${v.label}"`);
        lines.push(v.path.startsWith("http") ? v.path : resolveStreamPlaybackUrl({ ...full, streamUrl: v.path }));
      }
      continue;
    }
    const logo = s.streamIcon ? ` tvg-logo="${s.streamIcon}"` : "";
    const tvgId = resolveEpgId(s);
    const tvgName = s.name.replace(/"/g, "'");
    const group = s.type === StreamType.LIVE ? "Live" : s.type === StreamType.MOVIE ? "Movies" : "Series";
    const playUrl = exportPlaybackUrl(baseUrl, line, s, full);
    lines.push(
      `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" channel-id="${resolveChannelId(s)}"${logo} group-title="${group}",${s.name}`
    );
    lines.push(playUrl);
  }
  if (type === "m3u_plus") {
    return lines.join("\n");
  }
  return lines.join("\n");
}
