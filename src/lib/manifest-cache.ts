import { cacheGet, cacheSet, cacheDel } from "@/lib/cache";
import { getRedis } from "@/lib/redis";

const MANIFEST_CACHE_PREFIX = "hls:manifest:";
const SEGMENT_CACHE_PREFIX = "hls:segment:";

export function manifestCacheKey(lineId: string, streamId: string): string {
  return `${MANIFEST_CACHE_PREFIX}${lineId}:${streamId}`;
}

export function segmentCacheKey(lineId: string, streamId: string, segmentUrl: string): string {
  const hash = Buffer.from(segmentUrl, "utf8").toString("base64url").slice(0, 32);
  return `${SEGMENT_CACHE_PREFIX}${lineId}:${streamId}:${hash}`;
}

export type CachedManifest = {
  body: string;
  finalUrl: string;
  cachedAt: number;
};

export type CachedSegment = {
  body: ArrayBuffer;
  contentType: string;
  cachedAt: number;
};

export async function getCachedManifest(
  lineId: string,
  streamId: string
): Promise<CachedManifest | null> {
  return cacheGet<CachedManifest>(manifestCacheKey(lineId, streamId));
}

export async function setCachedManifest(
  lineId: string,
  streamId: string,
  body: string,
  finalUrl: string,
  ttlSec: number = 8
): Promise<void> {
  await cacheSet(manifestCacheKey(lineId, streamId), {
    body,
    finalUrl,
    cachedAt: Date.now(),
  }, ttlSec);
}

export async function getCachedSegment(
  lineId: string,
  streamId: string,
  segmentUrl: string
): Promise<CachedSegment | null> {
  return cacheGet<CachedSegment>(segmentCacheKey(lineId, streamId, segmentUrl));
}

export async function setCachedSegment(
  lineId: string,
  streamId: string,
  segmentUrl: string,
  body: ArrayBuffer,
  contentType: string,
  ttlSec: number = 30
): Promise<void> {
  await cacheSet(segmentCacheKey(lineId, streamId, segmentUrl), {
    body,
    contentType,
    cachedAt: Date.now(),
  }, ttlSec);
}

export async function invalidateManifestCache(
  lineId: string,
  streamId: string
): Promise<void> {
  await cacheDel(`${MANIFEST_CACHE_PREFIX}${lineId}:${streamId}`);
}

export async function warmManifestCache(
  lineId: string,
  streamIds: string[],
  fetchManifest: (streamId: string) => Promise<{ body: string; finalUrl: string } | null>,
  ttlSec: number = 8
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  await Promise.allSettled(
    streamIds.map(async (streamId) => {
      const cached = await getCachedManifest(lineId, streamId);
      if (cached) return;
      const result = await fetchManifest(streamId);
      if (result) {
        await setCachedManifest(lineId, streamId, result.body, result.finalUrl, ttlSec);
      }
    })
  );
}
