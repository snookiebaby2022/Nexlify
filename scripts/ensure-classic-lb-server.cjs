#!/usr/bin/env node
/**
 * Ensure a StreamServer row for classic LB (role=lb) and optionally set panel topology.
 * Never mutates the Main panel StreamServer — creates/updates name=classic-lb only.
 *
 *   CLASSIC_LB_HOST=1.2.3.4:8090 SET_TOPOLOGY=1 node scripts/ensure-classic-lb-server.cjs
 */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

function hostOnly(h) {
  return String(h || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0];
}

function portOf(h, fallback = 8090) {
  const s = String(h || "");
  if (s.includes(":") && !s.includes("://")) {
    const p = Number(s.split(":").pop());
    if (Number.isFinite(p) && p > 0) return p;
  }
  try {
    const u = new URL(s.includes("://") ? s : `http://${s}`);
    if (u.port) return Number(u.port);
  } catch {
    /* ignore */
  }
  return Number(process.env.CLASSIC_LB_PORT || fallback) || fallback;
}

(async () => {
  const hostRaw = process.env.CLASSIC_LB_HOST || process.argv[2] || "";
  if (!hostRaw.trim()) {
    console.error("Set CLASSIC_LB_HOST=ip or ip:port");
    process.exit(1);
  }
  const host = hostOnly(hostRaw);
  const port = portOf(hostRaw);
  const name = process.env.CLASSIC_LB_NAME || "classic-lb";
  const p = new PrismaClient();

  let server = await p.streamServer.findFirst({ where: { name } });
  const panelSettings = {
    role: "lb",
    edgeKind: "classic-ffmpeg",
    serverRole: "lb",
  };
  if (!server) {
    server = await p.streamServer.create({
      data: {
        name,
        host,
        port,
        isActive: true,
        sortOrder: 10,
        panelSettings,
        healthStatus: "ONLINE",
        healthMessage: "Classic LB (nginx/PHP + FFmpeg)",
      },
    });
    console.log(JSON.stringify({ created: true, id: server.id, host, port }, null, 2));
  } else {
    server = await p.streamServer.update({
      where: { id: server.id },
      data: {
        host,
        port,
        isActive: true,
        panelSettings: {
          ...(typeof server.panelSettings === "object" && server.panelSettings
            ? server.panelSettings
            : {}),
          ...panelSettings,
        },
        healthStatus: "ONLINE",
        healthMessage: "Classic LB (nginx/PHP + FFmpeg)",
      },
    });
    console.log(JSON.stringify({ updated: true, id: server.id, host, port }, null, 2));
  }

  if (process.env.SET_TOPOLOGY === "1") {
    const key = "settings.server";
    const row = await p.panelSetting.findUnique({ where: { key } });
    let val = {};
    try {
      val = row?.value ? JSON.parse(row.value) : {};
    } catch {
      val = {};
    }
    val.playbackTopology = "classic-lb";
    val.remoteLiveUpstream = `${host}:${port}`;
    val.classicLbConnectionsUrl = `http://${host}:${port}`;
    val.connectionHandler = process.env.CONNECTION_HANDLER || val.connectionHandler || "mysql";
    await p.panelSetting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(val) },
      update: { value: JSON.stringify(val) },
    });
    console.log(JSON.stringify({ topology: "classic-lb", remoteLiveUpstream: val.remoteLiveUpstream }, null, 2));
  }

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
