import { prisma } from "./prisma";

const STALE_MS = 30 * 1000; // 30 seconds — connections clear fast when user leaves

export async function countActiveConnectionsForLine(lineId: string) {
  const staleBefore = new Date(Date.now() - STALE_MS);
  return prisma.liveConnection.count({
    where: { lineId, lastSeenAt: { gte: staleBefore } },
  });
}

/** Distinct active sessions: group by IP+stream or count rows based on policy */
export async function countLineSessions(lineId: string) {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const rows = await prisma.liveConnection.findMany({
    where: { lineId, lastSeenAt: { gte: staleBefore } },
    select: { ip: true, streamId: true },
  });
  const keys = new Set(rows.map((r) => `${r.ip ?? ""}:${r.streamId ?? ""}`));
  return keys.size || rows.length;
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

  // Delete any stale connections from this IP first (handles channel switching)
  if (opts.ip) {
    await prisma.liveConnection.deleteMany({
      where: {
        lineId: opts.lineId,
        ip: opts.ip,
        lastSeenAt: { lt: staleBefore },
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
  const staleBefore = new Date(Date.now() - STALE_MS);
  await prisma.liveConnection.deleteMany({
    where: { lastSeenAt: { lt: staleBefore } },
  });

  return prisma.liveConnection.findMany({
    where: ownerId ? { line: { ownerId } } : undefined,
    include: connectionInclude,
    orderBy: { lastSeenAt: "desc" },
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
