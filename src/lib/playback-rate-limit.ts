const buckets = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = Number(process.env.PLAYBACK_RATE_LIMIT_PER_MIN ?? "120");

export function checkPlaybackRateLimit(lineId: string, ip: string, limit = DEFAULT_LIMIT) {
  const key = `${lineId}:${ip}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > limit) return false;
  return true;
}
