import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** Per-worker Prisma pool size from PM2 instance count + postgres max_connections. */
export function computePrismaConnectionLimit(instances?: number): number {
  const workers = Math.max(
    1,
    instances ??
      Number(process.env.PANEL_INSTANCES || process.env.NEXLIFY_PM2_INSTANCES || "2") ||
      2
  );
  const explicit = Number(process.env.NEXLIFY_DB_CONNECTION_LIMIT || "0") || 0;
  if (explicit > 0) return Math.max(2, Math.min(12, explicit));

  const postgresMax = Math.max(20, Number(process.env.NEXLIFY_POSTGRES_MAX_CONNECTIONS || "100") || 100);
  const reserved = Math.max(15, Number(process.env.NEXLIFY_DB_RESERVED_CONNECTIONS || "25") || 25);
  const perWorker = Math.floor((postgresMax - reserved) / workers);
  return Math.max(3, Math.min(10, perWorker));
}

/** Keep timestamp-without-timezone comparisons in UTC (server OS TZ is often not UTC). */
export function postgresUrlWithUtcTimezone(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const scheme = url.startsWith("postgresql://")
      ? "postgresql"
      : url.startsWith("postgres://")
        ? "postgres"
        : null;
    if (!scheme) return url;
    const parsed = new URL(url.replace(/^postgres(?:ql)?:\/\//, "http://"));
    const current = parsed.searchParams.get("options") ?? "";
    if (!/TimeZone\s*=\s*UTC/i.test(url) && !/TimeZone\s*=\s*UTC/i.test(current)) {
      parsed.searchParams.set("options", `${current} -c TimeZone=UTC`.trim());
    }

    const perWorker = computePrismaConnectionLimit();
    // Always enforce pool cap — a stale DATABASE_URL connection_limit=50 × 5 workers exhausts postgres.
    parsed.searchParams.set("connection_limit", String(perWorker));
    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", String(process.env.NEXLIFY_DB_POOL_TIMEOUT_SEC || "20"));
    }
    return parsed.toString().replace(/^http:\/\//, `${scheme}://`);
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}options=-c%20TimeZone%3DUTC`;
  }
}

const datasourceUrl = postgresUrlWithUtcTimezone(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
