import { cacheDel, cacheGet, cacheSet } from "./cache";

/** Active playback session TTL — refreshed on every track/pulse/edge keepalive. */
export const LIVE_SESSION_TTL_SEC = 300;

function sessionIpKey(ip?: string | null): string {
  let raw = ip?.trim() ?? "";
  if (raw.startsWith("::ffff:")) raw = raw.slice(7);
  if (!raw || raw === "127.0.0.1" || raw === "::1") return "*";
  return raw;
}

export function liveSessionCacheKey(lineId: string, streamId: string, ip?: string | null) {
  return `live:session:${lineId}:${streamId}:${sessionIpKey(ip)}`;
}

export async function touchLiveSession(
  lineId: string,
  streamId: string,
  ip?: string | null
): Promise<void> {
  if (!lineId || !streamId) return;
  await cacheSet(liveSessionCacheKey(lineId, streamId, ip), true, LIVE_SESSION_TTL_SEC);
  if (ip) {
    await cacheSet(liveSessionCacheKey(lineId, streamId, null), true, LIVE_SESSION_TTL_SEC);
  }
}

export async function isLiveSessionActive(
  lineId: string,
  streamId?: string | null,
  ip?: string | null
): Promise<boolean> {
  if (!lineId || !streamId) return false;
  if (await cacheGet<boolean>(liveSessionCacheKey(lineId, streamId, ip))) return true;
  if (ip && (await cacheGet<boolean>(liveSessionCacheKey(lineId, streamId, null)))) return true;
  return false;
}

export async function clearLiveSession(
  lineId: string,
  streamId: string,
  ip?: string | null
): Promise<void> {
  await cacheDel(liveSessionCacheKey(lineId, streamId, ip));
  await cacheDel(liveSessionCacheKey(lineId, streamId, null));
}
