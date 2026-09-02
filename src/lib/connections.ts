import { prisma } from "./prisma";
import { cacheGetOrSet, cacheDelExact, cacheGet, cacheSet } from "./cache";
import { clearConnectionQuality, recordConnectionMediaBytes } from "./connection-quality-live";
import {
  clearConnectionPlaybackOutput,
  resolvePlaybackOutputLabel,
  setConnectionPlaybackOutput,
} from "./connection-playback-output";
import { clearLiveSession, isLiveSessionActive, setViewerActiveStream, touchLiveSession } from "./live-session";

export const STALE_MS = 10 * 60 * 1000; // cron — MPEG-TS pipes often go minutes between panel pulses
/** Live Connections UI + capacity. 45s was killing long MPEG-TS watches (no playlist heartbeat). */
export const LIVE_STALE_MS = 3 * 60 * 1000;
export const PLAYBACK_STALE_MS = LIVE_STALE_MS;
export const LIVE_LIST_STALE_MS = LIVE_STALE_MS;
/** Abort a spliced live body only after a long silence — not a normal GOP/ad gap. */
export const LIVE_PIPE_IDLE_ABORT_MS = 8 * 60 * 1000;
const CONNECTIONS_CACHE_TTL = 1; // seconds — dashboard SSE should reflect disconnects quickly

/** Exact Redis keys only — never SCAN the catalog keyspace with conn:*. */
function invalidateConnectionCaches(opts?: { lineId?: string; ownerId?: string | null }) {
  void cacheDelExact("conn:list:all").catch(() => {});
  if (opts?.ownerId) void cacheDelExact(`conn:list:${opts.ownerId}`).catch(() => {});
  if (opts?.lineId) void cacheDelExact(`conn:line_sessions:${opts.lineId}`).catch(() => {});
}
/** After Kick, block reconnect / track refresh for this long (covers multi-worker via Redis). */
export const KICK_DENY_TTL_SEC = 120;

/** Normalize client IP for DB + Redis keys (empty/loopback → null in Postgres). */
export function normalizeConnectionIp(ip?: string | null): string | null {
  let raw = ip?.trim() ?? "";
  if (raw.startsWith("::ffff:")) raw = raw.slice(7);
  if (!raw || raw === "127.0.0.1" || raw === "::1") return null;
  return raw;
}

/** RFC 5737 / deploy smoke-test IPs — must not consume real viewer connection slots. */
export function isTestConnectionIp(ip?: string | null): boolean {
  const n = normalizeConnectionIp(ip);
  if (!n) return false;
  if (n === "1.2.3.4" || n === "1.1.1.1") return true;
  return n.startsWith("203.0.113.") || n.startsWith("198.51.100.") || n.startsWith("192.0.2.");
}

/** Match rows stored with null or "" when IP was missing on either side. */
export function connectionIpPrismaFilter(ip?: string | null) {
  const normalized = normalizeConnectionIp(ip);
  if (normalized) return { ip: normalized };
  return { OR: [{ ip: null }, { ip: "" }] };
}

type LiveProxyHandle = { abort: () => void };
const liveProxies = new Map<string, Set<LiveProxyHandle>>();

export function liveSessionKey(lineId: string, ip?: string | null, streamId?: string | null) {
  return `${lineId}|${normalizeConnectionIp(ip) ?? ""}|${streamId ?? ""}`;
}

function kickDenyCacheKey(lineId: string, ip?: string | null) {
  const normalized = normalizeConnectionIp(ip);
  return `kick:deny:${lineId}:${normalized ?? "*"}`;
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
  const clientIp = normalizeConnectionIp(ip);
  const matches = (key: string) => {
    if (streamId) return key === liveSessionKey(lineId, clientIp, streamId);
    if (clientIp) return key.startsWith(`${lineId}|${clientIp}|`);
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
  const clientIp = normalizeConnectionIp(ip);
  const specific = await cacheGet<boolean>(kickDenyCacheKey(lineId, clientIp));
  if (specific) return true;
  const allIp = await cacheGet<boolean>(kickDenyCacheKey(lineId, "*"));
  return Boolean(allIp);
}

async function markSessionKicked(lineId: string, ip?: string | null) {
  const clientIp = normalizeConnectionIp(ip);
  await cacheSet(kickDenyCacheKey(lineId, clientIp), true, KICK_DENY_TTL_SEC);
  abortLocalProxies(lineId, clientIp, null);
}

export async function countActiveConnectionsForLine(lineId: string) {
  const staleBefore = new Date(Date.now() - PLAYBACK_STALE_MS);
  return prisma.liveConnection.count({
    where: { lineId, lastSeenAt: { gte: staleBefore } },
  });
}

/** Count distinct viewer sessions (line + stream + IP), not duplicate DB rows. */
export async function countDistinctActiveConnections(ownerId?: string): Promise<number> {
  const stats = await liveViewerStats(ownerId);
  return stats.onlineConnections;
}

/** Uncached count for real-time dashboard SSE (no Redis delay). */
export async function countDistinctActiveConnectionsUncached(
  ownerId?: string,
  _staleBefore: Date = new Date(Date.now() - LIVE_STALE_MS)
): Promise<number> {
  const stats = await liveViewerStats(ownerId);
  return stats.onlineConnections;
}

/** Count total active connections without loading rows into memory */
export async function countActiveConnections(ownerId?: string): Promise<number> {
  return countDistinctActiveConnections(ownerId);
}

/**
 * Open connections + online users from the same lastSeen-fresh session list.
 * Dashboard KPIs must not mix a cached groupBy with a raw COUNT DISTINCT.
 */
export async function liveViewerStats(ownerId?: string): Promise<{
  onlineConnections: number;
  onlineUsers: number;
  onlineStreams: number;
}> {
  const rows = await listLiveConnections(ownerId);
  const users = new Set<string>();
  const streams = new Set<string>();
  let onlineConnections = 0;
  for (const row of rows) {
    if (isTestConnectionIp(row.ip)) continue;
    onlineConnections += 1;
    users.add(row.lineId);
    if (row.streamId) streams.add(row.streamId);
  }
  return {
    onlineConnections,
    onlineUsers: users.size,
    onlineStreams: streams.size,
  };
}

/** Stream IDs currently playing (live connections). Matches dashboard Online Stream count. */
export async function listOnlineLiveStreamIds(ownerId?: string): Promise<string[]> {
  const rows = await listLiveConnections(ownerId);
  const ids = new Set<string>();
  for (const row of rows) {
    if (isTestConnectionIp(row.ip)) continue;
    if (row.streamId) ids.add(row.streamId);
  }
  return [...ids];
}

/** Distinct active sessions: use groupBy instead of loading all rows */
export async function countLineSessions(lineId: string) {
  const { cacheGetOrSet } = await import("./cache");
  return cacheGetOrSet(`conn:line_sessions:${lineId}`, 5, async () => {
    const staleBefore = new Date(Date.now() - PLAYBACK_STALE_MS);
    const result = await prisma.liveConnection.groupBy({
      by: ["ip", "streamId"],
      where: { lineId, lastSeenAt: { gte: staleBefore }, NOT: anonymousIpNotFilter() },
      _count: true,
    });
    return result.length;
  });
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

function anonymousIpNotFilter() {
  return {
    OR: [
      { ip: null },
      { ip: "" },
      { ip: "127.0.0.1" },
      { ip: "::1" },
      { ip: "1.2.3.4" },
      { ip: "1.1.1.1" },
      { ip: { startsWith: "203.0.113." } },
      { ip: { startsWith: "198.51.100." } },
      { ip: { startsWith: "192.0.2." } },
    ],
  };
}

/** Drop deploy/probe rows so they never block max_connections for real viewers. */
async function pruneTestConnectionRows(lineId: string) {
  const result = await prisma.liveConnection.deleteMany({
    where: {
      lineId,
      OR: [
        { ip: "1.2.3.4" },
        { ip: "1.1.1.1" },
        { ip: { startsWith: "203.0.113." } },
        { ip: { startsWith: "198.51.100." } },
        { ip: { startsWith: "192.0.2." } },
      ],
    },
  });
  if (result.count > 0) invalidateConnectionCaches();
}

function sessionKey(lineId: string, streamId: string | null | undefined, ip?: string | null) {
  return `${lineId}|${streamId ?? ""}|${normalizeConnectionIp(ip) ?? ""}`;
}

/** One live row per line + stream + viewer IP (XCIPTV/HLS must not multiply sessions). */
async function dedupeLiveConnectionRows(
  lineId: string,
  streamId?: string | null,
  clientIp?: string | null
) {
  const staleBefore = new Date(Date.now() - LIVE_STALE_MS);
  const rows = await prisma.liveConnection.findMany({
    where: {
      lineId,
      lastSeenAt: { gte: staleBefore },
      ...(streamId ? { streamId } : {}),
      ...(clientIp !== undefined ? connectionIpPrismaFilter(clientIp) : {}),
    },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, streamId: true, ip: true, lastSeenAt: true },
    take: 200,
  });
  const keepIds = new Set<string>();
  const dropIds: string[] = [];
  for (const row of rows) {
    const key = sessionKey(lineId, row.streamId, row.ip);
    if (keepIds.has(key)) {
      dropIds.push(row.id);
    } else {
      keepIds.add(key);
    }
  }
  if (dropIds.length) {
    await prisma.liveConnection.deleteMany({ where: { id: { in: dropIds } } });
    invalidateConnectionCaches();
  }
}

/** Drop dead rows for one line before enforcing max connections (edge pulse can lag). */
async function pruneLineStaleConnections(lineId: string, thresholdMs: number = PLAYBACK_STALE_MS) {
  const staleBefore = new Date(Date.now() - thresholdMs);
  const staleRows = await prisma.liveConnection.findMany({
    where: { lineId, lastSeenAt: { lt: staleBefore }, streamId: { not: null } },
    select: { id: true, lineId: true, streamId: true, ip: true },
    take: 500,
  });
  if (!staleRows.length) return 0;
  const toDelete: string[] = [];
  for (const row of staleRows) {
    if (!row.streamId) continue;
    if (await isLiveSessionActive(row.lineId, row.streamId, row.ip)) continue;
    toDelete.push(row.id);
  }
  if (!toDelete.length) return 0;
  const result = await prisma.liveConnection.deleteMany({ where: { id: { in: toDelete } } });
  if (result.count > 0) invalidateConnectionCaches();
  return result.count;
}

/** Distinct active streams for max-connection enforcement (never counts anonymous/loopback rows). */
async function countCapacitySessions(lineId: string) {
  const staleBefore = new Date(Date.now() - PLAYBACK_STALE_MS);
  const result = await prisma.liveConnection.groupBy({
    by: ["streamId"],
    where: {
      lineId,
      lastSeenAt: { gte: staleBefore },
      NOT: anonymousIpNotFilter(),
    },
  });
  return result.length;
}

export async function lineHasConnectionCapacity(
  lineId: string,
  maxConnections: number,
  opts?: { streamId?: string; clientIp?: string }
) {
  if (maxConnections <= 0) return true;
  const clientIp = normalizeConnectionIp(opts?.clientIp);
  if (isTestConnectionIp(clientIp)) return true;
  // Never block live-auth / zap on housekeeping (XUI-style instant auth).
  void pruneTestConnectionRows(lineId).catch(() => {});
  void pruneLineStaleConnections(lineId).catch(() => {});
  try {
    return await Promise.race([
      lineHasConnectionCapacityInner(lineId, maxConnections, opts),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 800)),
    ]);
  } catch {
    return false;
  }
}

async function lineHasConnectionCapacityInner(
  lineId: string,
  maxConnections: number,
  opts?: { streamId?: string; clientIp?: string }
) {
  if (maxConnections <= 0) return true;
  const clientIp = normalizeConnectionIp(opts?.clientIp);
  if (isTestConnectionIp(clientIp)) return true;

  const { cacheGetOrSet } = await import("@/lib/cache");
  const cacheKey = `conn:cap:${lineId}:${clientIp ?? ""}:${opts?.streamId ?? ""}`;
  return cacheGetOrSet(cacheKey, 3, async () => lineHasConnectionCapacityDb(lineId, maxConnections, opts));
}

async function lineHasConnectionCapacityDb(
  lineId: string,
  maxConnections: number,
  opts?: { streamId?: string; clientIp?: string }
) {
  const clientIp = normalizeConnectionIp(opts?.clientIp);
  const staleBefore = new Date(Date.now() - PLAYBACK_STALE_MS);

  // Same stream refresh / HLS segment from an existing viewer — always allow.
  if (opts?.streamId && clientIp) {
    const sameStream = await prisma.liveConnection.findFirst({
      where: {
        lineId,
        streamId: opts.streamId,
        ...connectionIpPrismaFilter(clientIp),
        lastSeenAt: { gte: staleBefore },
      },
      select: { id: true },
    });
    if (sameStream) return true;
  }

  // Existing viewer (channel zap / reconnect) — allow while within their slot count.
  if (clientIp) {
    const clientSessions = await prisma.liveConnection.groupBy({
      by: ["streamId"],
      where: {
        lineId,
        ...connectionIpPrismaFilter(clientIp),
        lastSeenAt: { gte: staleBefore },
      },
    });
    if (clientSessions.length > 0) {
      return clientSessions.length <= maxConnections;
    }
  }

  const active = await countCapacitySessions(lineId);
  return active < maxConnections;
}

/** Remove other active streams for the same viewer (channel zap / failover cleanup). */
export async function pruneOtherViewerStreams(
  lineId: string,
  streamId: string,
  clientIp?: string | null
): Promise<void> {
  const normalized = normalizeConnectionIp(clientIp);
  if (!normalized || !streamId) return;
  const stale = await prisma.liveConnection.findMany({
    where: {
      lineId,
      ...connectionIpPrismaFilter(normalized),
      streamId: { not: streamId },
    },
    select: { streamId: true },
  });
  if (!stale.length) return;
  await prisma.liveConnection.deleteMany({
    where: {
      lineId,
      ...connectionIpPrismaFilter(normalized),
      streamId: { not: streamId },
    },
  });
  for (const row of stale) {
    if (row.streamId) void clearLiveSession(lineId, row.streamId, normalized);
  }
  void setViewerActiveStream(lineId, streamId, normalized);
  invalidateConnectionCaches();
}

export async function trackConnection(opts: {
  lineId: string;
  streamId?: string;
  ip?: string;
  userAgent?: string;
  /** Xtream playback path e.g. /live/user/pass/123.ts — used for Output column. */
  playbackPath?: string;
  /** Bytes observed this heartbeat (HLS segment size, TS chunk, etc.) for quality scoring. */
  mediaBytes?: number;
  /** When true, drop other streams for this viewer (channel zap). Default false — heartbeats must not prune. */
  pruneOthers?: boolean;
}): Promise<string | null> {
  const clientIp = normalizeConnectionIp(opts.ip);
  // Deploy smoke tests must not occupy real viewer slots or Live Connections rows.
  if (isTestConnectionIp(clientIp ?? opts.ip)) {
    return null;
  }
  // Hard kick: do not revive a session that was just kicked
  if (await isSessionKicked(opts.lineId, clientIp ?? opts.ip)) {
    return null;
  }

  let streamId = opts.streamId?.trim() || undefined;
  if (streamId) {
    if (/^\d+$/.test(streamId)) {
      const { resolveStreamIdParam } = await import("@/lib/xtream-stream-id");
      const resolved = await resolveStreamIdParam(streamId, { lineId: opts.lineId });
      if (!resolved) return null;
      streamId = resolved;
    } else if (!/^[a-z0-9]{20,}$/i.test(streamId)) {
      const exists = await prisma.stream.findUnique({
        where: { id: streamId },
        select: { id: true },
      });
      if (!exists) return null;
    }
  }

  if (streamId && clientIp && opts.pruneOthers) {
    const lineCap = await prisma.line.findUnique({
      where: { id: opts.lineId },
      select: { maxConnections: true },
    });
    const maxConn = Math.max(1, lineCap?.maxConnections ?? 1);
    if (maxConn <= 1) {
    const byIp = await prisma.liveConnection.findFirst({
      where: { lineId: opts.lineId, ip: clientIp },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, streamId: true },
    });
    if (byIp) {
      try {
        await prisma.liveConnection.update({
          where: { id: byIp.id },
          data: {
            streamId,
            lastSeenAt: new Date(),
            ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
          },
        });
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== "P2025") throw err;
      }
      if (byIp.streamId && byIp.streamId !== streamId) {
        await prisma.liveConnection.deleteMany({
          where: {
            lineId: opts.lineId,
            ip: clientIp,
            id: { not: byIp.id },
          },
        });
      }
      invalidateConnectionCaches();
      void touchLiveSession(opts.lineId, streamId, clientIp);
      void setViewerActiveStream(opts.lineId, streamId, clientIp);
      return byIp.id;
    }
    }
  }

  // Drop loopback/anonymous duplicate rows for this stream when a real client IP connects.
  if (clientIp && streamId) {
    await prisma.liveConnection.deleteMany({
      where: {
        lineId: opts.lineId,
        streamId,
        OR: [
          { ip: null },
          { ip: "" },
          { ip: "127.0.0.1" },
          { ip: "::1" },
          { ip: "209.237.141.15" },
          { ip: "45.88.138.18" },
        ],
      },
    });
  }

  // Channel zap: only on explicit session start (live-auth / first GET), never on heartbeats.
  if (opts.pruneOthers && clientIp && streamId) {
    await pruneOtherViewerStreams(opts.lineId, streamId, clientIp);
  } else if (!clientIp && streamId) {
    await prisma.liveConnection.deleteMany({
      where: {
        lineId: opts.lineId,
        OR: [{ ip: null }, { ip: "" }],
        streamId: { not: streamId },
      },
    });
  }

  const touchQuality = () => {
    if (!streamId) return;
    const bytes = Math.max(0, opts.mediaBytes ?? 120_000);
    void recordConnectionMediaBytes(opts.lineId, streamId, clientIp ?? "", bytes);
  };

  if (streamId) void touchLiveSession(opts.lineId, streamId, clientIp);
  if (clientIp && streamId && opts.pruneOthers) {
    void setViewerActiveStream(opts.lineId, streamId, clientIp);
  }

  const existing = await prisma.liveConnection.findFirst({
    where: {
      lineId: opts.lineId,
      streamId: streamId ?? null,
      ...connectionIpPrismaFilter(clientIp),
    },
    orderBy: { lastSeenAt: "desc" },
  });

  if (streamId) {
    const dupes = await prisma.liveConnection.findMany({
      where: { lineId: opts.lineId, streamId, ...connectionIpPrismaFilter(clientIp) },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    });
    if (dupes.length > 1) {
      const keepId = existing?.id ?? dupes[0]!.id;
      const dropIds = dupes.filter((d) => d.id !== keepId).map((d) => d.id);
      if (dropIds.length) {
        await prisma.liveConnection.deleteMany({ where: { id: { in: dropIds } } });
      }
    }
  }

  if (!existing && clientIp && streamId) {
    const loose = await prisma.liveConnection.findFirst({
      where: {
        lineId: opts.lineId,
        streamId,
        OR: [
          { ip: null },
          { ip: "" },
          { ip: "127.0.0.1" },
          { ip: "::1" },
          { ip: "209.237.141.15" },
          { ip: "45.88.138.18" },
        ],
      },
      orderBy: { lastSeenAt: "desc" },
    });
    if (loose) {
      await prisma.liveConnection.updateMany({
        where: { id: loose.id },
        data: { lastSeenAt: new Date(), ip: clientIp },
      });
      invalidateConnectionCaches();
      void touchLiveSession(opts.lineId, streamId, clientIp);
      touchQuality();
      if (streamId) {
        const output = resolvePlaybackOutputLabel({
          requestPath: opts.playbackPath,
          userAgent: opts.userAgent,
        });
        void setConnectionPlaybackOutput(opts.lineId, streamId, clientIp, output);
        const { recordLineWatch } = await import("@/lib/line-watch");
        void recordLineWatch(opts.lineId, streamId, clientIp ?? undefined);
      }
      const { recordConnectionGeography } = await import("@/lib/connection-geography");
      void recordConnectionGeography({
        lineId: opts.lineId,
        streamId,
        ip: opts.ip,
      });
      await dedupeLiveConnectionRows(opts.lineId, streamId, clientIp);
      return loose.id;
    }
  }

  if (existing) {
    const { cacheGet, cacheSet } = await import("@/lib/cache");
    const debounceKey = `conn:touch:${opts.lineId}:${clientIp ?? ""}:${streamId ?? ""}`;
    const recentlyTouched = await cacheGet<boolean>(debounceKey);
    if (recentlyTouched) {
      if (streamId) void touchLiveSession(opts.lineId, streamId, clientIp);
      touchQuality();
      return existing.id;
    }
    await cacheSet(debounceKey, true, 12);

    await prisma.liveConnection.updateMany({
      where: { id: existing.id },
      data: { lastSeenAt: new Date(), ...(clientIp ? { ip: clientIp } : {}) },
    });
    invalidateConnectionCaches();
    if (streamId) void touchLiveSession(opts.lineId, streamId, clientIp);
    touchQuality();
    if (streamId) {
      const output = resolvePlaybackOutputLabel({
        requestPath: opts.playbackPath,
        userAgent: opts.userAgent,
      });
      void setConnectionPlaybackOutput(opts.lineId, streamId, clientIp, output);
      const { recordLineWatch } = await import("@/lib/line-watch");
      void recordLineWatch(opts.lineId, streamId, clientIp ?? undefined);
    }
    const { recordConnectionGeography } = await import("@/lib/connection-geography");
    void recordConnectionGeography({
      lineId: opts.lineId,
      streamId,
      ip: opts.ip,
    });
    await dedupeLiveConnectionRows(opts.lineId, streamId, clientIp);
    return existing.id;
  }

  try {
    const conn = await prisma.liveConnection.create({
      data: {
        lineId: opts.lineId,
        streamId,
        ip: clientIp,
        userAgent: opts.userAgent,
      },
    });
    invalidateConnectionCaches();
    touchQuality();
    if (streamId) void touchLiveSession(opts.lineId, streamId, clientIp);
    if (streamId) {
      const output = resolvePlaybackOutputLabel({
        requestPath: opts.playbackPath,
        userAgent: opts.userAgent,
      });
      void setConnectionPlaybackOutput(opts.lineId, streamId, clientIp, output);
      const { recordLineWatch } = await import("@/lib/line-watch");
      void recordLineWatch(opts.lineId, streamId);
    }
    const { recordConnectionGeography } = await import("@/lib/connection-geography");
    void recordConnectionGeography({
      lineId: opts.lineId,
      streamId,
      ip: opts.ip,
    });
    return conn.id;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2003") return null;
    throw err;
  } finally {
    if (streamId) {
      await dedupeLiveConnectionRows(opts.lineId, streamId, clientIp);
    }
  }
}

/** Remove connection when user stops watching */
export async function removeConnection(lineId: string, streamId: string, ip: string) {
  abortLocalProxies(lineId, ip, streamId);
  const deleted = await prisma.liveConnection.deleteMany({
    where: { lineId, streamId, ...connectionIpPrismaFilter(ip) },
  });
  if (deleted.count === 0) {
    await prisma.liveConnection.deleteMany({
      where: { lineId, streamId },
    });
  }
  void clearLiveSession(lineId, streamId, ip);
  void clearConnectionQuality(lineId, streamId, ip);
  void clearConnectionPlaybackOutput(lineId, streamId, ip);
  invalidateConnectionCaches();
}

const connectionInclude = {
  line: { select: { username: true, maxConnections: true, ownerId: true, isRestreamer: true } },
  stream: {
    select: {
      id: true,
      name: true,
      type: true,
      serverId: true,
      server: { select: { id: true, name: true, host: true, domain: true } },
    },
  },
} as const;

export async function listActiveConnections(ownerId?: string) {
  const cacheKey = ownerId ? `conn:list:${ownerId}` : "conn:list:all";
  return cacheGetOrSet(cacheKey, CONNECTIONS_CACHE_TTL, async () => {
    const staleBefore = new Date(Date.now() - LIVE_STALE_MS);
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

/** Delete rows with no heartbeat within `thresholdMs` and no active session key. */
export async function pruneStaleConnections(thresholdMs: number = STALE_MS) {
  const staleBefore = new Date(Date.now() - thresholdMs);
  const staleRows = await prisma.liveConnection.findMany({
    where: { lastSeenAt: { lt: staleBefore }, streamId: { not: null } },
    select: { id: true, lineId: true, streamId: true, ip: true },
    take: 5000,
  });
  const toDelete: string[] = [];
  for (const row of staleRows) {
    if (!row.streamId) continue;
    if (await isLiveSessionActive(row.lineId, row.streamId, row.ip)) continue;
    toDelete.push(row.id);
  }
  if (!toDelete.length) return { count: 0 };
  const result = await prisma.liveConnection.deleteMany({
    where: { id: { in: toDelete } },
  });
  if (result.count > 0) invalidateConnectionCaches();
  return result;
}

export async function deleteStaleConnections() {
  return pruneStaleConnections(STALE_MS);
}

/** List connections with a recent lastSeenAt. Redis session keys used to be 45s —
 *  requiring them AND lastSeen made Open Connections drop between HLS segments. */
export async function listLiveConnections(ownerId?: string, take = 5000) {
  const staleBefore = new Date(Date.now() - LIVE_LIST_STALE_MS);
  const baseWhere = {
    ...(ownerId ? { line: { ownerId } } : {}),
  };
  const rows = await prisma.liveConnection.findMany({
    where: {
      ...baseWhere,
      lastSeenAt: { gte: staleBefore },
    },
    include: connectionInclude,
    orderBy: [{ startedAt: "asc" }, { lastSeenAt: "desc" }],
    take: Math.min(Math.max(1, take), 5000),
  });
  const live = rows.filter((row) => row.streamId && !isTestConnectionIp(row.ip));
  const seen = new Set<string>();
  const deduped: typeof live = [];
  for (const row of live) {
    const key = sessionKey(row.lineId, row.streamId, row.ip);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped.slice(0, Math.min(Math.max(1, take), 5000));
}

export async function deleteActiveConnection(id: string, ownerId?: string) {
  const conn = await prisma.liveConnection.findFirst({
    where: ownerId ? { id, line: { ownerId } } : { id },
    select: { id: true, lineId: true, ip: true, streamId: true },
  });
  if (!conn) throw new Error("Connection not found");

  await markSessionKicked(conn.lineId, conn.ip);
  abortLocalProxies(conn.lineId, conn.ip, conn.streamId);
  if (conn.streamId) await clearLiveSession(conn.lineId, conn.streamId, conn.ip);
  await prisma.liveConnection.delete({ where: { id: conn.id } }).catch(() => undefined);
  invalidateConnectionCaches();
}

export async function clearActiveConnections(ownerId?: string) {
  const staleBefore = new Date(Date.now() - LIVE_STALE_MS);
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
  invalidateConnectionCaches();
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
    if (timerHeartbeat) {
      clearInterval(timerHeartbeat);
      timerHeartbeat = null;
    }
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

  const abortIfKicked = () => {
    void isSessionKicked(lineId, ip).then((kicked) => {
      if (kicked) abort();
    });
  };

  const IDLE_MS = LIVE_PIPE_IDLE_ABORT_MS;
  const HEARTBEAT_MS = 5_000;
  const TIMER_HEARTBEAT_MS = 5_000;
  let timerHeartbeat: ReturnType<typeof setInterval> | null = null;

  const touchSession = (mediaBytes?: number) => {
    void trackConnection({
      lineId,
      streamId,
      ip,
      userAgent,
      mediaBytes: mediaBytes ?? 96_000,
    });
    abortIfKicked();
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      reader = body.getReader();
      unregister = registerLiveProxy(lineId, ip, streamId, { abort });
      timerHeartbeat = setInterval(() => {
        if (closed) return;
        if (Date.now() - lastByteAt > IDLE_MS) {
          abort();
          return;
        }
        if (Date.now() - lastTrackAt >= HEARTBEAT_MS) {
          lastTrackAt = Date.now();
          touchSession();
        }
      }, TIMER_HEARTBEAT_MS);
      const pump = () => {
        if (closed) return;
        void (async () => {
          try {
            const { done, value } = await reader!.read();
            if (done) {
              if (!closed) {
                try {
                  controller.close();
                } catch {
                  /* ignore */
                }
                finish();
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
              touchSession(byteLen > 0 ? byteLen : undefined);
            } else if (Date.now() - lastTrackAt > HEARTBEAT_MS) {
              lastTrackAt = Date.now();
              touchSession(byteLen > 0 ? byteLen : undefined);
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

/** Kick every active session watching a stream (XUI-style "kill all on stream"). */
export async function kickStreamConnections(streamId: string, ownerId?: string) {
  const where = ownerId
    ? { streamId, line: { ownerId } }
    : { streamId };
  const rows = await prisma.liveConnection.findMany({
    where,
    select: { id: true, lineId: true, ip: true, streamId: true },
    take: 5000,
  });
  for (const row of rows) {
    await markSessionKicked(row.lineId, row.ip);
    abortLocalProxies(row.lineId, row.ip, row.streamId);
  }
  const result = await prisma.liveConnection.deleteMany({ where });
  invalidateConnectionCaches();
  return result.count;
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
  invalidateConnectionCaches();
  return result.count;
}

