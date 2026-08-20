import { prisma } from "./prisma";
import { cacheGetOrSet, cacheDel, cacheGet, cacheSet } from "./cache";
import { clearConnectionQuality, recordConnectionMediaBytes } from "./connection-quality-live";

export const STALE_MS = 5 * 60 * 1000; // 5 minutes — DB cleanup for orphaned rows
export const LIVE_STALE_MS = 45 * 1000; // 45s — live connections display (who is watching now)
/** Max-connection checks use a shorter window so closed/zombie sessions free slots quickly. */
export const PLAYBACK_STALE_MS = 60 * 1000;
const CONNECTIONS_CACHE_TTL = 5; // 5 seconds — short TTL for dashboard responsiveness
/** After Kick, block reconnect / track refresh for this long (covers multi-worker via Redis). */
export const KICK_DENY_TTL_SEC = 120;

type LiveProxyHandle = { abort: () => void };
const liveProxies = new Map<string, Set<LiveProxyHandle>>();

export function liveSessionKey(lineId: string, ip?: string | null, streamId?: string | null) {
  return `${lineId}|${ip ?? ""}|${streamId ?? ""}`;
}

function kickDenyCacheKey(lineId: string, ip?: string | null) {
  return `kick:deny:${lineId}:${ip ?? "*"}`;
}

/** Register an in-process live proxy so Kick can abort the HTTP body on this worker. */
export function registerLiveProxy(
  lineId: string,
  ip: string | null | undefined,
  streamId: string | null | undefined,
  handle: LiveProxyHandle
) {
  const key = liveSessionKey(lineId, ip, streamId);
  let set = liveProxies.get(key);
  if (!set) {
    set = new Set();
    liveProxies.set(key, set);
  }
  set.add(handle);
  return () => {
    set!.delete(handle);
    if (set!.size === 0) liveProxies.delete(key);
  };
}

function abortLocalProxies(lineId: string, ip?: string | null, streamId?: string | null) {
  const matches = (key: string) => {
    if (streamId) return key === liveSessionKey(lineId, ip, streamId);
    if (ip != null && ip !== "") return key.startsWith(`${lineId}|${ip}|`);
    return key.startsWith(`${lineId}|`);
  };
  for (const [key, set] of [...liveProxies.entries()]) {
    if (!matches(key)) continue;
    for (const h of [...set]) {
      try {
        h.abort();
      } catch {
        /* ignore */
      }
    }
    liveProxies.delete(key);
  }
}

/** True if this line/IP was kicked recently and must not keep streaming. */
export async function isSessionKicked(lineId: string, ip?: string | null): Promise<boolean> {
  if (!lineId) return false;
  const specific = await cacheGet<boolean>(kickDenyCacheKey(lineId, ip));
  if (specific) return true;
  const allIp = await cacheGet<boolean>(kickDenyCacheKey(lineId, "*"));
  return Boolean(allIp);
}

async function markSessionKicked(lineId: string, ip?: string | null) {
  await cacheSet(kickDenyCacheKey(lineId, ip ?? null), true, KICK_DENY_TTL_SEC);
  abortLocalProxies(lineId, ip ?? null, null);
}

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
  const staleBefore = new Date(Date.now() - PLAYBACK_STALE_MS);
  const result = await prisma.liveConnection.groupBy({
    by: ["ip", "streamId"],
    where: { lineId, lastSeenAt: { gte: staleBefore } },
    _count: true,
  });
  return result.length;
}

/**
 * Whether a new playback session is allowed given current counts.
 * Exported for unit tests — keep in sync with lineHasConnectionCapacity.
 *
 * @param sameIpDistinctSessions distinct (stream) sessions from clientIp
 */
export function connectionCapacityAllows(
  activeSessionCount: number,
  maxConnections: number,
  sameIpDistinctSessions: number,
  clientIp?: string | null
): boolean {
  if (maxConnections <= 0) return true;
  if (activeSessionCount < maxConnections) return true;
  if (!clientIp) return false;
  if (sameIpDistinctSessions === 0) return false;
  // Same IP may refresh or zap channels while within their slot count — not open extra streams.
  return sameIpDistinctSessions <= maxConnections;
}

export async function lineHasConnectionCapacity(
  lineId: string,
  maxConnections: number,
  opts?: { streamId?: string; clientIp?: string }
) {
  if (maxConnections <= 0) return true;
  const active = await countLineSessions(lineId);
  if (active < maxConnections) return true;
  let sameIpDistinct = 0;
  if (opts?.clientIp) {
    const staleBefore = new Date(Date.now() - PLAYBACK_STALE_MS);
    const sameIpSessions = await prisma.liveConnection.groupBy({
      by: ["streamId"],
      where: {
        lineId,
        ip: opts.clientIp,
        lastSeenAt: { gte: staleBefore },
      },
    });
    sameIpDistinct = sameIpSessions.length;
  }
  return connectionCapacityAllows(active, maxConnections, sameIpDistinct, opts?.clientIp);
}

export async function trackConnection(opts: {
  lineId: string;
  streamId?: string;
  ip?: string;
  userAgent?: string;
}): Promise<string | null> {
  // Hard kick: do not revive a session that was just kicked
  if (await isSessionKicked(opts.lineId, opts.ip)) {
    return null;
  }

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
  void clearConnectionQuality(lineId, streamId, ip);
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

export async function deleteStaleConnections() {
  const staleBefore = new Date(Date.now() - STALE_MS);
  return prisma.liveConnection.deleteMany({
    where: { lastSeenAt: { lt: staleBefore } },
  });
}

/** List connections that are actually live right now (refreshed within last 2 minutes) */
export async function listLiveConnections(ownerId?: string, take = 5000) {
  const staleBefore = new Date(Date.now() - LIVE_STALE_MS);
  return prisma.liveConnection.findMany({
    where: {
      lastSeenAt: { gte: staleBefore },
      ...(ownerId ? { line: { ownerId } } : {}),
    },
    include: connectionInclude,
    orderBy: { lastSeenAt: "desc" },
    take: Math.min(Math.max(1, take), 5000),
  });
}

export async function deleteActiveConnection(id: string, ownerId?: string) {
  const conn = await prisma.liveConnection.findFirst({
    where: ownerId ? { id, line: { ownerId } } : { id },
    select: { id: true, lineId: true, ip: true, streamId: true },
  });
  if (!conn) throw new Error("Connection not found");

  await markSessionKicked(conn.lineId, conn.ip);
  abortLocalProxies(conn.lineId, conn.ip, conn.streamId);
  await prisma.liveConnection.delete({ where: { id: conn.id } }).catch(() => undefined);
  void cacheDel("conn:*").catch(() => {});
}

export async function clearActiveConnections(ownerId?: string) {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const rows = await prisma.liveConnection.findMany({
    where: {
      lastSeenAt: { gte: staleBefore },
      ...(ownerId ? { line: { ownerId } } : {}),
    },
    select: { id: true, lineId: true, ip: true, streamId: true },
    take: 5000,
  });
  for (const row of rows) {
    await markSessionKicked(row.lineId, row.ip);
    abortLocalProxies(row.lineId, row.ip, row.streamId);
  }
  if (rows.length) {
    await prisma.liveConnection.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
  }
  void cacheDel("conn:*").catch(() => {});
}

/** Wrap a live proxy body so Kick aborts mid-stream and heartbeat respects deny TTL. */
export function attachKickAwareProxyBody(opts: {
  body: ReadableStream<Uint8Array>;
  lineId: string;
  streamId: string;
  ip: string;
  userAgent?: string;
}): ReadableStream<Uint8Array> {
  const { body, lineId, streamId, ip, userAgent } = opts;
  let closed = false;
  let tracked = false;
  let lastTrackAt = 0;
  let lastByteAt = Date.now();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let unregister: (() => void) | null = null;

  const finish = () => {
    if (closed) return;
    closed = true;
    unregister?.();
    unregister = null;
    void removeConnection(lineId, streamId, ip);
  };

  const abort = () => {
    try {
      reader?.cancel().catch(() => undefined);
    } catch {
      /* ignore */
    }
    finish();
  };

  const IDLE_MS = 12_000;
  const HEARTBEAT_MS = 10_000;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      reader = body.getReader();
      unregister = registerLiveProxy(lineId, ip, streamId, { abort });
      const pump = () => {
        if (closed) return;
        void (async () => {
          try {
            const { done, value } = await reader!.read();
            if (done) {
              if (!closed) {
                closed = true;
                unregister?.();
                controller.close();
                void removeConnection(lineId, streamId, ip);
              }
              return;
            }
            lastByteAt = Date.now();
            const byteLen = value?.byteLength ?? 0;
            // Enqueue before any DB work — VLC aborts if the first 0x47 is delayed.
            controller.enqueue(value);
            if (byteLen > 0) {
              void recordConnectionMediaBytes(lineId, streamId, ip, byteLen);
            }
            if (!tracked) {
              tracked = true;
              lastTrackAt = Date.now();
              void trackConnection({ lineId, streamId, ip, userAgent }).then((id) => {
                if (!id) abort();
              });
            } else if (Date.now() - lastTrackAt > HEARTBEAT_MS) {
              lastTrackAt = Date.now();
              void trackConnection({ lineId, streamId, ip, userAgent }).then((id) => {
                if (!id) abort();
              });
            }
            if (Date.now() - lastByteAt > IDLE_MS) {
              abort();
              return;
            }
            pump();
          } catch {
            if (!closed) {
              try {
                controller.close();
              } catch {
                /* ignore */
              }
              finish();
            }
          }
        })();
      };
      pump();
    },
    cancel() {
      abort();
    },
  });
}

/** Kick every active session on a line (used by line “Kill connections”). */
export async function kickLineConnections(lineId: string, ownerId?: string) {
  const where = ownerId
    ? { lineId, line: { ownerId } }
    : { lineId };
  const rows = await prisma.liveConnection.findMany({
    where,
    select: { id: true, lineId: true, ip: true, streamId: true },
    take: 5000,
  });
  await cacheSet(kickDenyCacheKey(lineId, "*"), true, KICK_DENY_TTL_SEC);
  abortLocalProxies(lineId, null, null);
  for (const row of rows) {
    await markSessionKicked(row.lineId, row.ip);
    abortLocalProxies(row.lineId, row.ip, row.streamId);
  }
  const result = await prisma.liveConnection.deleteMany({ where });
  void cacheDel("conn:*").catch(() => {});
  return result.count;
}

