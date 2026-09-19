#!/usr/bin/env node
/** One-shot classic-lb → Postgres LiveConnection sync (no path aliases). */
process.env.TZ = "UTC";
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { randomBytes } = require("crypto");

const p = new PrismaClient();

function logLine(level, msg, extra) {
  const base = `[${new Date().toISOString()}] classic-lb-sync ${msg}`;
  console.log(extra && Object.keys(extra).length ? `${base} ${JSON.stringify(extra)}` : base);
}

function newId() {
  return `c${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

/** Prisma TIMESTAMP without TZ: pass UTC wall-clock string, not Date (avoids Berlin +2 skew). */
function utcSql(d) {
  return d.toISOString().replace("T", " ").replace(/Z$/, "");
}

function isTestConnectionIp(ip) {
  const n = String(ip || "").trim();
  return n.startsWith("203.0.113.") || n.startsWith("198.51.100.") || n.startsWith("192.0.2.");
}

async function main() {
  const colocated =
    require("fs").existsSync("/opt/nexlify-lb/php/connections_export.php") ||
    require("fs").existsSync("/etc/nexlify-lb/lb.env");
  const row = await p.panelSetting.findUnique({ where: { key: "settings.server" } });
  const server = typeof row?.value === "string" ? JSON.parse(row.value) : row?.value || {};
  const topo = String(server.playbackTopology || "");
  if (
    topo !== "classic-lb" &&
    process.env.NEXLIFY_CLASSIC_LB !== "1" &&
    !colocated
  ) {
    logLine("info", "skip topology_not_classic_lb", { topology: topo || "(unset)", colocated });
    return;
  }
  const base =
    String(server.classicLbConnectionsUrl || "").trim() ||
    String(process.env.CLASSIC_LB_CONNECTIONS_URL || "").trim() ||
    String(server.remoteLiveUpstream || "").trim() ||
    "http://127.0.0.1:8090";
  let origin = base.includes("://") ? base : `http://${base}`;
  const u = new URL(origin);
  if (!u.port || ["80", "443", "8080"].includes(u.port)) u.port = "8090";
  if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
    u.hostname = "127.0.0.1";
    u.port = "8090";
  }
  const token =
    process.env.CLASSIC_LB_AGENT_TOKEN ||
    process.env.PANEL_INTERNAL_SECRET ||
    process.env.AGENT_TOKEN ||
    "";
  const url = `${u.origin}/lb/connections.json?stale=600`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    logLine("warn", "export_http_error", { status: res.status, url });
    return;
  }
  const j = await res.json();
  const connections = Array.isArray(j.connections) ? j.connections : [];
  logLine("info", "export_fetched", {
    count: connections.length,
    handler: j.handler ?? null,
    url,
  });

  let synced = 0;
  const now = new Date();
  /** @type {Map<string, Set<string>>} lineId -> "streamId\0ip" */
  const activeByLine = new Map();
  for (const c of connections) {
    const lineId = String(c.lineId || "").trim();
    let streamId = String(c.streamId || "").trim();
    if (!lineId || !streamId) continue;
    if (/^\d+$/.test(streamId)) {
      // numeric xtream id — skip if we can't resolve cheaply; look up by channel numeric
      const n = Number(streamId);
      const found = await p.stream.findFirst({
        where: { OR: [{ id: streamId }, { channelId: String(n) }] },
        select: { id: true },
      });
      // Prefer streams that match xtream numeric via existing helper table if any — fallback skip
      if (!found) {
        // try resolve like panel: many streams use cuid; numeric is xtream hash — leave to Next helper
        continue;
      }
      streamId = found.id;
    }
    const ip = String(c.ip || "").trim();
    // Smoke / load-test RFC5737 ranges must never enter Live Connections.
    if (isTestConnectionIp(ip)) continue;
    const lastSeen = c.lastSeenAt ? new Date(c.lastSeenAt) : now;
    const startedRaw = c.startedAt ? new Date(c.startedAt) : null;
    const startedAt =
      startedRaw && Number.isFinite(startedRaw.getTime()) ? startedRaw : lastSeen;
    try {
      await p.$executeRawUnsafe(
        `INSERT INTO "LiveConnection" (id, "lineId", "streamId", ip, "userAgent", "startedAt", "lastSeenAt")
         VALUES ($1,$2,$3,$4,$5,$6::timestamp,$7::timestamp)
         ON CONFLICT ("lineId","streamId",ip)
         DO UPDATE SET "lastSeenAt"=EXCLUDED."lastSeenAt",
           "startedAt"=CASE
             WHEN "LiveConnection"."lastSeenAt" < EXCLUDED."lastSeenAt" - INTERVAL '45 seconds'
               THEN EXCLUDED."startedAt"
             ELSE LEAST("LiveConnection"."startedAt", EXCLUDED."startedAt")
           END,
           "userAgent"=COALESCE(EXCLUDED."userAgent","LiveConnection"."userAgent")`,
        newId(),
        lineId,
        streamId,
        ip,
        c.userAgent ?? null,
        utcSql(startedAt),
        utcSql(lastSeen)
      );
      synced += 1;
      if (!activeByLine.has(lineId)) activeByLine.set(lineId, new Set());
      activeByLine.get(lineId).add(`${streamId}\0${ip}`);
    } catch (e) {
      logLine("warn", "row_skip", { lineId, streamId, error: e.message });
    }
  }

  // Drop zap ghosts: for every line we just saw on the LB, remove Postgres rows
  // that are no longer in the export (prior channels after maxConnections=1 zap).
  let prunedGhosts = 0;
  for (const [lineId, keep] of activeByLine) {
    const rows = await p.liveConnection.findMany({
      where: { lineId },
      select: { id: true, streamId: true, ip: true },
    });
    const dropIds = rows
      .filter((r) => {
        if (keep.has(`${r.streamId || ""}\0${r.ip || ""}`)) return false;
        // Retain freshly heartbeating rows missing from a partial export snapshot
        // (buffering / auth stampede) so Live Connections does not go empty.
        const age = Date.now() - new Date(r.lastSeenAt).getTime();
        if (Number.isFinite(age) && age < 120_000) return false;
        return true;
      })
      .map((r) => r.id);
    if (dropIds.length) {
      prunedGhosts += (await p.liveConnection.deleteMany({ where: { id: { in: dropIds } } })).count;
    }
  }

  // Hard cap: keep newest N per line.maxConnections
  let droppedExtras = 0;
  const over = await p.$queryRawUnsafe(`
    SELECT l.id AS "lineId", l."maxConnections", count(lc.id)::int AS open_conns
    FROM "LiveConnection" lc
    JOIN "Line" l ON l.id = lc."lineId"
    WHERE lc."streamId" IS NOT NULL
    GROUP BY l.id
    HAVING count(lc.id) > GREATEST(l."maxConnections", 0)
  `);
  for (const row of over) {
    const keepN = Math.max(0, Number(row.maxConnections) || 0);
    const conns = await p.liveConnection.findMany({
      where: { lineId: row.lineId, streamId: { not: null } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    });
    const ids = conns.slice(keepN).map((c) => c.id);
    if (!ids.length) continue;
    droppedExtras += (await p.liveConnection.deleteMany({ where: { id: { in: ids } } })).count;
  }

  const stale = await p.liveConnection.deleteMany({
    where: { lastSeenAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
  });

  logLine("info", "sync_complete", {
    synced,
    exportCount: connections.length,
    prunedGhosts,
    droppedExtras,
    droppedStale10m: stale.count,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
