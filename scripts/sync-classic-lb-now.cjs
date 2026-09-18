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
           "startedAt"=LEAST("LiveConnection"."startedAt", EXCLUDED."startedAt"),
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
    } catch (e) {
      logLine("warn", "row_skip", { lineId, streamId, error: e.message });
    }
  }
  logLine("info", "sync_complete", { synced, exportCount: connections.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
