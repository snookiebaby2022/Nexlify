import { getRedis } from "./redis";

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = Number(process.env.PLAYBACK_RATE_LIMIT_PER_MIN ?? "120");

export async function checkPlaybackRateLimit(
  lineId: string,
  ip: string,
  limit = DEFAULT_LIMIT
): Promise<boolean> {
  const key = `nexlify:rl:playback:${lineId}:${ip}`;
  const redis = getRedis();
  if (redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.pexpire(key, WINDOW_MS);
      const results = await pipeline.exec();
      if (!results || !results[0]) return true;
      const count = results[0][1];
      const countNum = typeof count === "number" ? count : Number(count) || 0;
      if (countNum > limit) return false;
      return true;
    } catch {
      /* fallback to memory */
    }
  }

  // In-memory fallback (unreliable under multi-instance; Redis should be used in production)
  const now = Date.now();
  const bucket = memoryBucket.get(key);
  if (!bucket || now > bucket.resetAt) {
    memoryBucket.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  bucket.count++;
  if (bucket.count > limit) return false;
  return true;
}

const memoryBucket = new Map<string, { count: number; resetAt: number }>();

// Prune stale buckets every 60s to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memoryBucket) {
    if (now > v.resetAt) memoryBucket.delete(k);
  }
}, 60_000).unref?.();
