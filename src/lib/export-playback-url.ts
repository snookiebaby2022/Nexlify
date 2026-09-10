import type { Stream } from "@prisma/client";
import { StreamType } from "@prisma/client";
import { resolveStreamPlaybackUrl, type StreamWithProvider } from "./resolve-stream-url";
import { isHlsPlaybackUrl } from "./hls-playback";
import type { StreamForLine } from "./lines";

type LineCreds = { username: string; password: string };

function isHlsUpstream(stream: StreamWithProvider, seed?: string): boolean {
  try {
    const url = resolveStreamPlaybackUrl(stream, seed);
    return isHlsPlaybackUrl(url);
  } catch {
    return false;
  }
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function livePlaybackBase(baseUrl: string, ignoreMediaOrigin = false): string {
  if (!ignoreMediaOrigin) {
    const configured = String(process.env.NEXLIFY_MEDIA_ORIGIN ?? "").trim();
    if (configured) return trimBase(configured);
  }
  return trimBase(baseUrl);
}

function vodPlaybackBase(baseUrl: string, ignoreMediaOrigin = false): string {
  // Proxied /movie|/series must use the LB/media edge (panel nginx refuses bitrate).
  return livePlaybackBase(baseUrl, ignoreMediaOrigin);
}

/** MAG/Ministra cannot play modern TLS or random :8080 media IPs — use panel :80. */
export function magHttpPlaybackOrigin(baseUrl: string): string {
  try {
    const u = new URL(baseUrl.includes("://") ? baseUrl : `http://${baseUrl}`);
    u.protocol = "http:";
    if (u.port === "443" || u.port === "80") u.port = "";
    return u.origin;
  } catch {
    return String(baseUrl || "")
      .replace(/^https:/i, "http:")
      .replace(/:443(?=\/|$)/, "")
      .replace(/\/+$/, "");
  }
}

/**
 * URL placed in M3U / Xtream exports.
 * @param output - "hls" forces .m3u8, "ts" forces .ts, "auto" matches the upstream format.
 * @param directPlay - when true, VOD returns the raw provider URL (faster, source exposed).
 *                     when false, VOD goes through the LB/media edge /movie|/series path.
 */
export function exportPlaybackUrl(
  baseUrl: string,
  line: LineCreds,
  stream: Pick<Stream, "id" | "type" | "streamUrl" | "containerExtension">,
  full?: StreamWithProvider | StreamForLine,
  seed?: string,
  output: "hls" | "ts" | "auto" = "auto",
  directPlay: boolean = true,
  ignoreMediaOrigin = false
): string {
  const resolved = (full ?? stream) as StreamWithProvider;

  if (stream.type === StreamType.LIVE) {
    const liveBase = livePlaybackBase(baseUrl, ignoreMediaOrigin);
    if (output === "hls" && full && isHlsUpstream(resolved, seed)) {
      return `${liveBase}/live/${line.username}/${line.password}/${stream.id}.m3u8`;
    }
    return `${liveBase}/live/${line.username}/${line.password}/${stream.id}.ts`;
  }

  const ext =
    String(stream.containerExtension ?? "")
      .replace(/^\./, "")
      .toLowerCase() || "mp4";

  // Direct play needs a resolved source URL. Lean catalog rows omit it.
  if (directPlay && (resolved.streamUrl || resolved.playlistUrl || resolved.backupUrl)) {
    const directUrl = resolveStreamPlaybackUrl(resolved, seed);
    if (directUrl) return directUrl;
  }

  if (stream.type === StreamType.SERIES) {
    return `${vodPlaybackBase(baseUrl, ignoreMediaOrigin)}/series/${line.username}/${line.password}/${stream.id}.${ext === "mp4" ? "mkv" : ext}`;
  }
  return `${vodPlaybackBase(baseUrl, ignoreMediaOrigin)}/movie/${line.username}/${line.password}/${stream.id}.${ext}`;
}
