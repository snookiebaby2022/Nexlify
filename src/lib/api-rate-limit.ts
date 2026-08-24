import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { getSettingGroup } from "@/lib/panel-settings";
import { clientIp } from "@/lib/middleware-runtime";

const WINDOW_MS = 60_000;
const RL_PREFIX = "nexlify:rl:admin-api:";
const SETTINGS_CACHE_MS = 60_000;

let cachedLimit = { at: 0, perMin: 120 };

async function adminApiLimitPerMin(): Promise<number> {
  const now = Date.now();
  if (now - cachedLimit.at < SETTINGS_CACHE_MS) return cachedLimit.perMin;
  try {
    const security = await getSettingGroup("security");
    const n = Number(security.apiRateLimitPerMin ?? 120);
    cachedLimit = { at: now, perMin: Number.isFinite(n) && n > 0 ? n : 120 };
  } catch {
    cachedLimit = { at: now, perMin: 120 };
  }
  return cachedLimit.perMin;
}

const memoryBucket = new Map<string, { count: number; resetAt: number }>();

async function bumpCount(key: string, limit: number): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const rkey = `${RL_PREFIX}${key}`;
      const pipeline = redis.pipeline();
      pipeline.incr(rkey);
      pipeline.pexpire(rkey, WINDOW_MS);
      const results = await pipeline.exec();
      if (results?.[0]) {
        const count = Number(results[0][1]) || 0;
        return count <= limit;
      }
    } catch {
      /* memory fallback */
    }
  }

  const now = Date.now();
  const bucket = memoryBucket.get(key);
  if (!bucket || now > bucket.resetAt) {
    memoryBucket.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= limit;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memoryBucket) {
    if (now > v.resetAt) memoryBucket.delete(k);
  }
}, 60_000).unref?.();

export function isAdminApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/reseller") ||
    pathname === "/api/auth/login" ||
    pathname === "/api/portal/login"
  );
}

/** Returns null when allowed, or a 429 NextResponse when over limit. */
export async function enforceAdminApiRateLimit(
  req: NextRequest
): Promise<NextResponse | null> {
  if (!isAdminApiPath(req.nextUrl.pathname)) return null;
  const limit = await adminApiLimitPerMin();
  const ip = clientIp(req) || "unknown";
  const window = Math.floor(Date.now() / WINDOW_MS);
  const key = `${ip}:${window}`;

  const ok = await bumpCount(key, limit);
  if (ok) return null;
  return NextResponse.json(
    { error: "API rate limit exceeded. Retry in a minute." },
    { status: 429, headers: { "Retry-After": "60" } }
  );
}
