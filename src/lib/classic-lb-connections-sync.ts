/**
 * Sync classic LB live connections (MySQL/Redis via LB HTTP export) into Postgres LiveConnection.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { invalidateConnectionCaches } from "@/lib/connections";
import { notifyLiveConnectionsChanged } from "@/lib/connection-live-bus";
import { resolveXtreamNumericStreamId } from "@/lib/xtream-stream-id";
import { parsePlaybackTopology } from "@/lib/playback-topology";

export type ClassicLbConnRow = {
  lineId: string;
  streamId: string;
  ip?: string;
  userAgent?: string | null;
  bytes?: number;
  startedAt?: string | null;
  lastSeenAt?: string | null;
};

function newLiveConnectionId(): string {
  return `c${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function normalizeIp(ip?: string | null): string {
  return String(ip ?? "").trim();
}

/** Prisma TIMESTAMP without TZ — never pass Date (host TZ skews writes on Europe/*). */
function utcSql(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/Z$/, "");
}

const LOOPBACK_LB = "http://127.0.0.1:8090";

function diskTopologyHint(): { mode: string; remote: string } {
  try {
    const raw = readFileSync("/etc/nexlify/playback-topology", "utf8");
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return { mode: lines[0] || "", remote: lines[1] || "" };
  } catch {
    return { mode: "", remote: "" };
  }
}

function colocatedClassicLb(): boolean {
  return (
    existsSync("/opt/nexlify-lb/php/connections_export.php") ||
    existsSync("/etc/nexlify-lb/lb.env")
  );
}

/** Export lives on the FFmpeg LB internal port, even when settings still say remote-splice. */
function resolveClassicLbExportBase(server: Record<string, unknown>, optsBase?: string): string {
  const explicit =
    String(optsBase ?? "").trim() ||
    String(server.classicLbConnectionsUrl ?? "").trim() ||
    String(process.env.CLASSIC_LB_CONNECTIONS_URL ?? "").trim();
  if (explicit) return explicit;

  const topo = parsePlaybackTopology(server.playbackTopology);
  const remote = String(server.remoteLiveUpstream ?? "").trim();
  const disk = diskTopologyHint();
  const remoteBlob = `${remote} ${disk.remote} ${disk.mode}`;
  if (
    topo === "classic-lb" ||
    process.env.NEXLIFY_CLASSIC_LB === "1" ||
    parsePlaybackTopology(disk.mode) === "classic-lb" ||
    /:(8090|8092)\b/.test(remoteBlob) ||
    colocatedClassicLb()
  ) {
    return LOOPBACK_LB;
  }
  return remote;
}

export async function fetchClassicLbConnections(opts?: {
  baseUrl?: string;
  token?: string;
  staleSecs?: number;
}): Promise<ClassicLbConnRow[] | null> {
  const server = await getSettingGroup("server");
  const base = resolveClassicLbExportBase(server, opts?.baseUrl);
  if (!base) return [];

  let origin = base;
  if (!/^https?:\/\//i.test(origin)) {
    origin = `http://${origin}`;
  }
  const u = new URL(origin.includes("://") ? origin : `http://${origin}`);
  const topo = String(server.playbackTopology ?? "");
  const internalPort = String(
    process.env.CLASSIC_LB_INTERNAL_PORT ||
      server.classicLbInternalPort ||
      (topo === "classic-lb" ? "8090" : "8080")
  );
  // Co-located XUI: clients use :80/:443/:8080; connections export lives on internal LB port.
  const publicPorts = new Set(["", "80", "443", "8080"]);
  if (!u.port || publicPorts.has(u.port)) {
    if (topo === "classic-lb" || process.env.NEXLIFY_CLASSIC_LB === "1") {
      if (u.hostname === "127.0.0.1" || u.hostname === "localhost" || !u.port || publicPorts.has(u.port)) {
        u.port = internalPort;
      }
    } else if (!u.port) {
      u.port = "8080";
    }
  }
  // Prefer loopback when remoteLiveUpstream points at this panel host.
  if (topo === "classic-lb" && u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
    const loop = String(process.env.CLASSIC_LB_CONNECTIONS_URL || "").trim();
    if (loop) {
      try {
        const pref = new URL(loop.includes("://") ? loop : `http://${loop}`);
        u.hostname = pref.hostname;
        u.port = pref.port || internalPort;
        u.protocol = pref.protocol;
      } catch {
        /* keep */
      }
    }
  }
  // Keep active MPEG-TS sessions visible (heartbeats ~10s; auth alone is once-per-pull).
  const stale = opts?.staleSecs ?? 600;
  const url = `${u.origin}/lb/connections.json?stale=${stale}`;

  const token =
    String(opts?.token ?? "").trim() ||
    String(process.env.CLASSIC_LB_AGENT_TOKEN ?? "").trim() ||
    String(process.env.PANEL_INTERNAL_SECRET ?? "").trim() ||
    String(process.env.AGENT_TOKEN ?? "").trim();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { headers, signal: ac.signal, cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { connections?: ClassicLbConnRow[] };
    return Array.isArray(j.connections) ? j.connections : [];
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

let lastLiveListSyncAt = 0;
const LIVE_LIST_SYNC_MIN_MS = Math.max(
  3_000,
  Number(process.env.CLASSIC_LB_LIVE_LIST_SYNC_MS || 4_000)
);

/** True when panel should pull /lb/connections.json into Postgres for Live Connections. */
export async function isClassicLbConnectionsSyncEnabled(): Promise<boolean> {
  const server = await getSettingGroup("server");
  return Boolean(resolveClassicLbExportBase(server));
}

/**
 * Refresh LB heartbeats before Live Connections list/API (cron alone leaves lastSeen ~30s+ stale → 82% quality).
 */
export async function refreshClassicLbConnectionsForLiveList(): Promise<void> {
  const server = await getSettingGroup("server");
  if (!resolveClassicLbExportBase(server)) return;
  const now = Date.now();
  if (now - lastLiveListSyncAt < LIVE_LIST_SYNC_MIN_MS) return;
  lastLiveListSyncAt = now;
  await syncClassicLbConnectionsToPostgres();
}

export async function syncClassicLbConnectionsToPostgres(limit = 2000): Promise<number> {
  const server = await getSettingGroup("server");
  const base = resolveClassicLbExportBase(server);
  if (!base) {
    return 0;
  }

  const rows = await fetchClassicLbConnections({ baseUrl: base });
  // Failed or empty export — do NOT prune Postgres (would wipe Live Connections).
  if (rows === null || rows.length === 0) {
    return 0;
  }

  let synced = 0;
  const now = new Date();
  const streamIdCache = new Map<string, string | null>();
  for (const row of rows) {
    if (synced >= limit) break;
    const lineId = String(row.lineId ?? "").trim();
    let streamId = String(row.streamId ?? "").trim();
    if (!lineId || !streamId) continue;
    // Classic LB may still report Xtream numeric ids — map to Stream cuid for FK.
    if (/^\d+$/.test(streamId)) {
      if (!streamIdCache.has(streamId)) {
        const n = Number(streamId);
        streamIdCache.set(
          streamId,
          Number.isFinite(n)
            ? await resolveXtreamNumericStreamId(n, { lineId })
            : null
        );
      }
      const resolved = streamIdCache.get(streamId);
      if (!resolved) continue;
      streamId = resolved;
    }
    const ip = normalizeIp(row.ip);
    const lastSeen = row.lastSeenAt ? new Date(row.lastSeenAt) : now;
    const startedRaw = row.startedAt ? new Date(row.startedAt) : null;
    const startedAt =
      startedRaw && Number.isFinite(startedRaw.getTime()) && startedRaw.getTime() <= lastSeen.getTime() + 60_000
        ? startedRaw
        : lastSeen;
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "LiveConnection" (id, "lineId", "streamId", ip, "userAgent", "startedAt", "lastSeenAt")
         VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7::timestamp)
         ON CONFLICT ("lineId", "streamId", ip)
         DO UPDATE SET "lastSeenAt" = EXCLUDED."lastSeenAt",
           "startedAt" = LEAST("LiveConnection"."startedAt", EXCLUDED."startedAt"),
           "userAgent" = COALESCE(EXCLUDED."userAgent", "LiveConnection"."userAgent")`,
        newLiveConnectionId(),
        lineId,
        streamId,
        ip,
        row.userAgent ?? null,
        utcSql(startedAt),
        utcSql(lastSeen)
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "Line" SET "lastWatchedAt" = $1::timestamp, "lastWatchedStreamId" = $2,
           "lastWatchedIp" = CASE WHEN $3 <> '' THEN $3 ELSE "lastWatchedIp" END
         WHERE id = $4`,
        utcSql(lastSeen),
        streamId,
        ip,
        lineId
      );
      synced += 1;
    } catch {
      try {
        await prisma.liveConnection.upsert({
          where: { lineId_streamId_ip: { lineId, streamId, ip } },
          create: {
            lineId,
            streamId,
            ip,
            userAgent: row.userAgent ?? null,
            startedAt,
            lastSeenAt: lastSeen,
          },
          update: { lastSeenAt: lastSeen, userAgent: row.userAgent ?? undefined },
        });
        await prisma.line.update({
          where: { id: lineId },
          data: {
            lastWatchedAt: lastSeen,
            lastWatchedStreamId: streamId,
            ...(ip ? { lastWatchedIp: ip } : {}),
          },
        });
        synced += 1;
      } catch {
        /* skip bad row */
      }
    }
  }

  // Align with LIVE_STALE_MS (10m). Never wipe on empty/failed export.
  let pruned = 0;
  try {
    pruned = await prisma.$executeRawUnsafe(
      `DELETE FROM "LiveConnection" WHERE "lastSeenAt" < NOW() - INTERVAL '600 seconds'`
    );
  } catch {
    pruned = 0;
  }

  if (synced > 0 || pruned > 0) {
    invalidateConnectionCaches();
    notifyLiveConnectionsChanged();
  }
  return synced;
}
