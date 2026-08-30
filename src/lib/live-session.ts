import { cacheDel, cacheGet, cacheMget, cacheSet } from "./cache";

/** Active playback session TTL — match LIVE_STALE_MS so zap/prune stay aligned with the UI. */
export const LIVE_SESSION_TTL_SEC = 180;

function sessionIpKey(ip?: string | null): string {
  let raw = ip?.trim() ?? "";
  if (raw.startsWith("::ffff:")) raw = raw.slice(7);
  if (!raw || raw === "127.0.0.1" || raw === "::1") return "*";
  return raw;
}

export function liveSessionCacheKey(lineId: string, streamId: string, ip?: string | null) {
  return `live:session:${lineId}:${streamId}:${sessionIpKey(ip)}`;
}

/** One active stream per line+IP — ignores stale edge pipes after channel zap. */
export function viewerActiveStreamKey(lineId: string, ip?: string | null) {
  return `live:viewer:${lineId}:${sessionIpKey(ip)}`;
}

export async function setViewerActiveStream(
  lineId: string,
  streamId: string,
  ip?: string | null
): Promise<void> {
  if (!lineId || !streamId) return;
  await cacheSet(viewerActiveStreamKey(lineId, ip), streamId, LIVE_SESSION_TTL_SEC);
}

export async function getViewerActiveStream(
  lineId: string,
  ip?: string | null
): Promise<string | null> {
  if (!lineId) return null;
  const id = await cacheGet<string>(viewerActiveStreamKey(lineId, ip));
  return id?.trim() || null;
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
  const [specific, wildcard] = await cacheMget<boolean>([
    liveSessionCacheKey(lineId, streamId, ip),
    ...(ip ? [liveSessionCacheKey(lineId, streamId, null)] : []),
  ]);
  return Boolean(specific || wildcard);
}

/** Batch session checks for live connections list (one MGET per page). */
export async function batchIsLiveSessionActive(
  items: Array<{ lineId: string; streamId: string; ip?: string | null }>
): Promise<boolean[]> {
  if (!items.length) return [];
  const flatKeys: string[] = [];
  const slots: Array<{ primary: number; fallback?: number }> = [];
  for (const item of items) {
    const primary = flatKeys.length;
    flatKeys.push(liveSessionCacheKey(item.lineId, item.streamId, item.ip));
    let fallback: number | undefined;
    if (item.ip) {
      fallback = flatKeys.length;
      flatKeys.push(liveSessionCacheKey(item.lineId, item.streamId, null));
    }
    slots.push({ primary, fallback });
  }
  const values = await cacheMget<boolean>(flatKeys);
  return slots.map(({ primary, fallback }) =>
    Boolean(values[primary] || (fallback != null && values[fallback]))
  );
}

export async function clearLiveSession(
  lineId: string,
  streamId: string,
  ip?: string | null
): Promise<void> {
  await cacheDel(liveSessionCacheKey(lineId, streamId, ip));
  await cacheDel(liveSessionCacheKey(lineId, streamId, null));
}
