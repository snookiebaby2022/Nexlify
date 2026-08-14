import { prisma } from "./prisma";
import { cacheGetOrSet, cacheDel } from "./cache";

export const STALE_MS = 5 * 60 * 1000; // 5 minutes — connections expire quickly if not refreshed
export const LIVE_STALE_MS = 2 * 60 * 1000; // 2 minutes — for "live" connections display (shows who is actually watching now)
const CONNECTIONS_CACHE_TTL = 5; // 5 seconds — short TTL for dashboard responsiveness

export async function countActiveConnectionsForLine(lineId: string) {
  const staleBefore = new Date(Date.now() - STALE_MS);
  return prisma.liveConnection.count({
    where: { lineId, lastSeenAt: { gte: staleBefore } },
  });
}

/** Count total active connections without loading rows into memory */
export async function countActiveConnections(ownerId?: string): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const cacheKey = ownerId ? `conn:count:${ownerId}` : "conn:count:all";
  return cacheGetOrSet(cacheKey, CONNECTIONS_CACHE_TTL, () =>
    prisma.liveConnection.count({
      where: ownerId ? { line: { ownerId }, lastSeenAt: { gte: staleBefore } } : { lastSeenAt: { gte: staleBefore } },
    })
  );
}

/** Distinct active sessions: use groupBy instead of loading all rows */
export async function countLineSessions(lineId: string) {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const result = await prisma.liveConnection.groupBy({
    by: ["ip", "streamId"],
    where: { lineId, lastSeenAt: { gte: staleBefore } },
    _count: true,
  });
  return result.length;
}

export async function lineHasConnectionCapacity(
  lineId: string,
  maxConnections: number,
  opts?: { streamId?: string; clientIp?: string }
) {
  if (maxConnections <= 0) return true;
  const active = await countLineSessions(lineId);
  if (active < maxConnections) return true;
  // Same IP can always reconnect — allows channel switching from same device
  // and handles stale connections from the same IP gracefully
  if (opts?.clientIp) {
    const staleBefore = new Date(Date.now() - STALE_MS);
    const sameIpConns = await prisma.liveConnection.count({
      where: {
        lineId,
        ip: opts.clientIp,
        lastSeenAt: { gte: staleBefore },
      },
    });
    // If all active connections are from this IP, allow it (channel switching)
    if (sameIpConns > 0) return true;
  }
  return false;
}

export async function trackConnection(opts: {
  lineId: string;
  streamId?: string;
  ip?: string;
  userAgent?: string;
}) {
  const staleBefore = new Date(Date.now() - STALE_MS);

  // When a user switches channels, remove their previous active connection
  // This prevents duplicate connections from showing in the dashboard
  if (opts.ip) {
    // Delete ALL connections from this IP (not just stale ones)
    // This handles channel switching - old connection is replaced with new one
    await prisma.liveConnection.deleteMany({
      where: {
        lineId: opts.lineId,
        ip: opts.ip,
        // Only delete if it's a different stream (channel switching)
        streamId: opts.streamId ? { not: opts.streamId } : undefined,
      },
    });
  }

  const existing = await prisma.liveConnection.findFirst({
    where: {
      lineId: opts.lineId,
      streamId: opts.streamId ?? null,
      ip: opts.ip ?? null,
      lastSeenAt: { gte: staleBefore },
    },
  });

  if (existing) {
    await prisma.liveConnection.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
    });
    if (opts.streamId) {
      const { recordLineWatch } = await import("@/lib/line-watch");
      void recordLineWatch(opts.lineId, opts.streamId, opts.ip);
    }
    const { recordConnectionGeography } = await import("@/lib/connection-geography");
    void recordConnectionGeography({
      lineId: opts.lineId,
      streamId: opts.streamId,
      ip: opts.ip,
    });
    return existing.id;
  }

  const conn = await prisma.liveConnection.create({
    data: {
      lineId: opts.lineId,
      streamId: opts.streamId,
      ip: opts.ip,
      userAgent: opts.userAgent,
    },
  });
  if (opts.streamId) {
    const { recordLineWatch } = await import("@/lib/line-watch");
    void recordLineWatch(opts.lineId, opts.streamId);
  }
  const { recordConnectionGeography } = await import("@/lib/connection-geography");
  void recordConnectionGeography({
    lineId: opts.lineId,
    streamId: opts.streamId,
    ip: opts.ip,
  });
  return conn.id;
}

/** Remove connection when user stops watching */
export async function removeConnection(lineId: string, streamId: string, ip: string) {
  await prisma.liveConnection.deleteMany({
    where: { lineId, streamId, ip },
  });
  // Invalidate connection caches
  void cacheDel("conn:*").catch(() => {});
}

const connectionInclude = {
  line: { select: { username: true, maxConnections: true, ownerId: true, isRestreamer: true } },
  stream: {
    select: {
      id: true,
      name: true,
      type: true,
      server: { select: { name: true } },
    },
  },
} as const;

export async function listActiveConnections(ownerId?: string) {
  const cacheKey = ownerId ? `conn:list:${ownerId}` : "conn:list:all";
  return cacheGetOrSet(cacheKey, CONNECTIONS_CACHE_TTL, async () => {
    const staleBefore = new Date(Date.now() - STALE_MS);
    // Fire-and-forget stale cleanup — don't block the response
    void prisma.liveConnection.deleteMany({
      where: { lastSeenAt: { lt: staleBefore } },
    }).catch(() => {});

    return prisma.liveConnection.findMany({
      where: {
        lastSeenAt: { gte: staleBefore },
        ...(ownerId ? { line: { ownerId } } : {}),
      },
      include: connectionInclude,
      orderBy: { lastSeenAt: "desc" },
      take: 5000, // Safety limit — dashboard should use countActiveConnections() for totals
    });
  });
}

/** List connections that are actually live right now (refreshed within last 2 minutes) */
export async function listLiveConnections(ownerId?: string) {
  const staleBefore = new Date(Date.now() - LIVE_STALE_MS);
  return prisma.liveConnection.findMany({
    where: {
      lastSeenAt: { gte: staleBefore },
      ...(ownerId ? { line: { ownerId } } : {}),
    },
    include: connectionInclude,
    orderBy: { lastSeenAt: "desc" },
    take: 5000,
  });
}

export async function deleteActiveConnection(id: string, ownerId?: string) {
  if (ownerId) {
    const conn = await prisma.liveConnection.findFirst({
      where: { id, line: { ownerId } },
      select: { id: true },
    });
    if (!conn) throw new Error("Connection not found");
  }
  await prisma.liveConnection.delete({ where: { id } });
}

export async function clearActiveConnections(ownerId?: string) {
  const staleBefore = new Date(Date.now() - STALE_MS);
  await prisma.liveConnection.deleteMany({
    where: {
      lastSeenAt: { gte: staleBefore },
      ...(ownerId ? { line: { ownerId } } : {}),
    },
  });
}
