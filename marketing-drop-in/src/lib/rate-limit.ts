type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

function pruneBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, v] of buckets) {
    if (now >= v.resetAt) buckets.delete(k);
  }
  if (buckets.size < MAX_BUCKETS) return;
  const extra = buckets.size - Math.floor(MAX_BUCKETS / 2);
  let n = 0;
  for (const k of buckets.keys()) {
    buckets.delete(k);
    if (++n >= extra) break;
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  pruneBuckets(now);
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { ok: true };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return Response.json(
    { error: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}
