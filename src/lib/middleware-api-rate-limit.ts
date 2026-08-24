/**
 * Edge-safe (sync, no Prisma/Redis) first-line API rate limit for middleware.
 * Uses ADMIN_API_RATE_LIMIT_PER_MIN env or 120/min per IP.
 */
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = Math.max(
  10,
  Number(process.env.ADMIN_API_RATE_LIMIT_PER_MIN ?? "120") || 120
);

const buckets = new Map<string, { count: number; resetAt: number }>();

export function middlewareAdminApiRateLimit(ip: string, pathname: string): boolean {
  if (
    !pathname.startsWith("/api/admin") &&
    !pathname.startsWith("/api/reseller") &&
    pathname !== "/api/auth/login" &&
    pathname !== "/api/portal/login"
  ) {
    return true;
  }
  const key = `${ip || "unknown"}:${Math.floor(Date.now() / WINDOW_MS)}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= DEFAULT_LIMIT;
}
