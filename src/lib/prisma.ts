import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** Keep timestamp-without-time-zone comparisons in UTC (server OS TZ is often not UTC). */
function postgresUrlWithUtcTimezone(url: string | undefined): string | undefined {
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
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "8");
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
