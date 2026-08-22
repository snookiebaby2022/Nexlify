import { cacheGet, cacheMget, cacheSet, cacheDel } from "@/lib/cache";
import { parseXtreamPlaybackPath } from "@/lib/xtream-playback-path";

export type PlaybackOutputLabel = "MPEGTS" | "HLS" | "RTMP";

const OUTPUT_TTL_SEC = 180;

export function connectionPlaybackOutputKey(lineId: string, streamId: string, ip: string) {
  return `conn:out:${lineId}:${streamId}:${ip || "*"}`;
}

export async function setConnectionPlaybackOutput(
  lineId: string,
  streamId: string,
  ip: string | null | undefined,
  label: PlaybackOutputLabel
): Promise<void> {
  if (!lineId || !streamId) return;
  await cacheSet(connectionPlaybackOutputKey(lineId, streamId, ip ?? ""), label, OUTPUT_TTL_SEC);
}

export async function getConnectionPlaybackOutput(
  lineId: string,
  streamId: string | null | undefined,
  ip: string | null | undefined
): Promise<PlaybackOutputLabel | null> {
  if (!lineId || !streamId) return null;
  return cacheGet<PlaybackOutputLabel>(connectionPlaybackOutputKey(lineId, streamId, ip ?? ""));
}

/** Batch output label reads for Live Connections (one MGET). */
export async function batchGetConnectionPlaybackOutputs(
  items: Array<{ lineId: string; streamId: string; ip: string | null | undefined }>
): Promise<(PlaybackOutputLabel | null)[]> {
  const keys = items.map(({ lineId, streamId, ip }) =>
    lineId && streamId ? connectionPlaybackOutputKey(lineId, streamId, ip ?? "") : null
  );
  const fetchKeys = keys.filter((k): k is string => Boolean(k));
  const values = fetchKeys.length ? await cacheMget<PlaybackOutputLabel>(fetchKeys) : [];
  let vi = 0;
  return keys.map((k) => (k ? values[vi++] ?? null : null));
}

export async function clearConnectionPlaybackOutput(
  lineId: string,
  streamId: string,
  ip: string | null | undefined
): Promise<void> {
  await cacheDel(connectionPlaybackOutputKey(lineId, streamId, ip ?? ""));
}

/** Xtream URL path is authoritative — apps request /live/.../id.ts or .m3u8. */
export function inferPlaybackOutputFromPath(requestPath: string): PlaybackOutputLabel | null {
  const pathOnly = requestPath.split("?")[0] ?? requestPath;
  const parsed = parseXtreamPlaybackPath(pathOnly);
  if (!parsed) return null;
  if (parsed.wantsHls) return "HLS";
  if (parsed.spliceLiveTs) return "MPEGTS";
  if (parsed.kind === "timeshift") return "MPEGTS";
  return null;
}

/** Secondary hint when the request path is unavailable (VOD, old rows). */
export function inferPlaybackOutputFromUserAgent(userAgent: string | null | undefined): PlaybackOutputLabel | null {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return null;
  if (ua.includes("m3u8") || ua.includes("/hls/") || ua.includes("application/x-mpegurl")) return "HLS";
  if (ua.includes("mpegts") || ua.includes(".ts") || ua.includes("mp2t")) return "MPEGTS";
  if (ua.includes("vlc") || ua.includes("lavf") || ua.includes("ffmpeg")) return "MPEGTS";
  if (ua.includes("rtmp")) return "RTMP";
  return null;
}

export function resolvePlaybackOutputLabel(opts: {
  requestPath?: string | null;
  userAgent?: string | null;
  cached?: PlaybackOutputLabel | string | null;
}): PlaybackOutputLabel {
  const cached = opts.cached;
  if (cached === "MPEGTS" || cached === "HLS" || cached === "RTMP") return cached;
  const fromPath = opts.requestPath ? inferPlaybackOutputFromPath(opts.requestPath) : null;
  if (fromPath) return fromPath;
  const fromUa = inferPlaybackOutputFromUserAgent(opts.userAgent);
  if (fromUa) return fromUa;
  return "MPEGTS";
}
