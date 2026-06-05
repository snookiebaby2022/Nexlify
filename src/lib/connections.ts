import { prisma } from "./prisma";

const STALE_MS = 5 * 60 * 1000;

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

export async function lineHasConnectionCapacity(lineId: string, maxConnections: number) {
  if (maxConnections <= 0) return true;
  const active = await countLineSessions(lineId);
  return active < maxConnections;
}

export async function trackConnection(opts: {
  lineId: string;
  streamId?: string;
  ip?: string;
  userAgent?: string;
}) {
  const staleBefore = new Date(Date.now() - STALE_MS);
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
      void recordLineWatch(opts.lineId, opts.streamId);
    }
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
  return conn.id;
}

export async function listActiveConnections() {
  const staleBefore = new Date(Date.now() - STALE_MS);
  await prisma.liveConnection.deleteMany({
    where: { lastSeenAt: { lt: staleBefore } },
  });

  return prisma.liveConnection.findMany({
    include: {
      line: { select: { username: true, maxConnections: true } },
      stream: { select: { id: true, name: true, type: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  });
}
