import type { Stream } from "@prisma/client";
import { StreamType } from "@prisma/client";
import { resolveStreamPlaybackUrl, type StreamWithProvider } from "./resolve-stream-url";
import { isHlsPlaybackUrl } from "./hls-playback";
import { pickVodExtension } from "./vod-proxy";
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

/**
 * URL placed in M3U / Xtream exports.
 * @param output - "hls" forces .m3u8, "ts" forces .ts, "auto" matches the upstream format.
 * @param directPlay - when true, VOD returns the raw provider URL (faster, source exposed).
 *                     when false, VOD goes through the panel proxy (source hidden, Range support).
 */
export function exportPlaybackUrl(
  baseUrl: string,
  line: LineCreds,
  stream: Pick<Stream, "id" | "type" | "streamUrl" | "containerExtension">,
  full?: StreamWithProvider | StreamForLine,
  seed?: string,
  output: "hls" | "ts" | "auto" = "auto",
  directPlay: boolean = true
): string {
  const resolved = (full ?? stream) as StreamWithProvider;
  const base = trimBase(baseUrl);

  if (stream.type === StreamType.LIVE) {
    // Serve HLS sources as HLS when possible. Players handle native HLS far
    // better than a forced HLS->TS remux (faster zapping, no buffering).
    // output=hls forces HLS; output=auto picks HLS for HLS upstreams, TS otherwise.
    if ((output === "hls" || output === "auto") && isHlsUpstream(resolved, seed)) {
      return `${base}/live/${line.username}/${line.password}/${stream.id}.m3u8`;
    }
    return `${base}/live/${line.username}/${line.password}/${stream.id}.ts`;
  }

  // Direct play: return the raw provider URL (fastest, no panel overhead).
  if (directPlay) {
    const directUrl = resolveStreamPlaybackUrl(resolved, seed);
    if (directUrl) return directUrl;
  }

  // Proxy through panel: hides source URL, handles Range requests and HLS.
  const resolvedUrl = resolveStreamPlaybackUrl(resolved, seed);
  const ext = pickVodExtension(resolvedUrl);
  if (stream.type === StreamType.SERIES) {
    return `${base}/series/${line.username}/${line.password}/${stream.id}.${ext}`;
  }
  return `${base}/movie/${line.username}/${line.password}/${stream.id}.${ext}`;
}
