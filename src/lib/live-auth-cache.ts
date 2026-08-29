import { cacheGet, cacheSet } from "@/lib/cache";
import { normalizeConnectionIp } from "@/lib/connections";

/** XUI-style: cache resolved upstream on panel so edge cache miss still zaps fast. */
export type LiveAuthOutputMode = "ts" | "hls";

export type LiveAuthCacheEntry = {
  upstream: string;
  alts: string[];
  live: boolean;
  hlsNative?: boolean;
  wantsHls?: boolean;
  lineId: string;
  streamId: string;
  outputMode: LiveAuthOutputMode;
  serverId?: string | null;
  outboundProxy?: string | null;
};

const LIVE_AUTH_CACHE_SEC = Number(process.env.NEXLIFY_LIVE_AUTH_CACHE_SEC || 90);

export function liveAuthCacheKey(
  lineId: string,
  streamId: string,
  ip?: string | null,
  outputMode?: LiveAuthOutputMode | null,
  serverId?: string | null
): string {
  return `live-auth:v3:${lineId}:${streamId}:${normalizeConnectionIp(ip) ?? ""}:${outputMode ?? ""}:${serverId ?? ""}`;
}

export async function getLiveAuthCache(
  lineId: string,
  streamId: string,
  ip?: string | null,
  outputMode?: LiveAuthOutputMode | null,
  serverId?: string | null
): Promise<LiveAuthCacheEntry | null> {
  const hit = await cacheGet<LiveAuthCacheEntry>(
    liveAuthCacheKey(lineId, streamId, ip, outputMode, serverId)
  );
  if (!hit?.upstream?.trim()) return null;
  return hit;
}

export async function setLiveAuthCache(
  lineId: string,
  streamId: string,
  ip: string | null | undefined,
  entry: LiveAuthCacheEntry
): Promise<void> {
  await cacheSet(
    liveAuthCacheKey(lineId, streamId, ip, entry.outputMode, entry.serverId),
    entry,
    LIVE_AUTH_CACHE_SEC
  );
}
