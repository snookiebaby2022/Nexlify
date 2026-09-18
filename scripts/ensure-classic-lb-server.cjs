#!/usr/bin/env node
/**
 * Ensure a StreamServer row for classic LB (role=lb) and optionally set panel topology.
 * Never mutates the Main panel StreamServer — creates/updates name=classic-lb only.
 *
 * Advertised client ports: 80 / 443 (+ httpPorts 8080 by default).
 * Internal classic-lb nginx still listens on CLASSIC_LB_INTERNAL_PORT (8090) for
 * co-located Main→proxy; remote LBs use the same internal port unless overridden.
 *
 *   CLASSIC_LB_HOST=1.2.3.4 SET_TOPOLOGY=1 node scripts/ensure-classic-lb-server.cjs
 *   CLASSIC_LB_HOST=1.2.3.4:8090  # host only used; :8090 = internal listen, not server_info.port
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

/** Internal data-plane listen (nginx classic-lb). Not the Xtream-advertised port. */
function internalPortOf(h, fallback = 8090) {
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
  return Number(process.env.CLASSIC_LB_INTERNAL_PORT || fallback) || fallback;
}

function parseExtraPorts(raw, defaults) {
  if (!raw || !String(raw).trim()) return defaults;
  const out = [];
  for (const part of String(raw).split(/[,\s]+/)) {
    const n = Number(part);
    if (Number.isFinite(n) && n >= 1 && n <= 65535 && !out.includes(n)) out.push(Math.floor(n));
  }
  return out.length ? out : defaults;
}

(async () => {
  const hostRaw = process.env.CLASSIC_LB_HOST || process.argv[2] || "";
  if (!hostRaw.trim()) {
    console.error("Set CLASSIC_LB_HOST=ip or ip:internalPort");
    process.exit(1);
  }
  const host = hostOnly(hostRaw);
  const internalPort = internalPortOf(hostRaw);
  // Xtream server_info.port — standard HTTP (80), never internal 8090.
  const advertisedPort = Number(process.env.CLASSIC_LB_ADVERTISED_PORT || 80) || 80;
  const httpsPort = Number(process.env.CLASSIC_LB_HTTPS_PORT || 443) || 443;
  const httpExtra = parseExtraPorts(process.env.CLASSIC_LB_HTTP_PORTS, [80, 8080]);
  const httpsExtra = parseExtraPorts(process.env.CLASSIC_LB_HTTPS_PORTS, [443]);
  const optionalDomain = String(process.env.CLASSIC_LB_DOMAIN || "").trim() || null;
  const name = process.env.CLASSIC_LB_NAME || "classic-lb";
  const p = new PrismaClient();

  let server = await p.streamServer.findFirst({ where: { name } });
  const prev =
    server && typeof server.panelSettings === "object" && server.panelSettings
      ? server.panelSettings
      : {};
  const panelSettings = {
    ...prev,
    role: "lb",
    edgeKind: "classic-ffmpeg",
    serverRole: "lb",
    httpPorts: httpExtra,
    httpsPorts: httpsExtra,
    internalHttpPort: internalPort,
  };
  const data = {
    name,
    host,
    port: advertisedPort,
    httpsPort,
    isActive: true,
    sortOrder: 10,
    panelSettings,
    healthStatus: "ONLINE",
    healthMessage: "Classic LB (nginx/PHP + FFmpeg)",
  };
  if (optionalDomain) data.domain = optionalDomain;

  if (!server) {
    server = await p.streamServer.create({ data });
    console.log(
      JSON.stringify(
        { created: true, id: server.id, host, port: advertisedPort, httpsPort, internalPort },
        null,
        2
      )
    );
  } else {
    server = await p.streamServer.update({
      where: { id: server.id },
      data: {
        host: data.host,
        port: data.port,
        httpsPort: data.httpsPort,
        isActive: true,
        panelSettings: data.panelSettings,
        healthStatus: "ONLINE",
        healthMessage: data.healthMessage,
        ...(optionalDomain ? { domain: optionalDomain } : {}),
      },
    });
    console.log(
      JSON.stringify(
        { updated: true, id: server.id, host, port: advertisedPort, httpsPort, internalPort },
        null,
        2
      )
    );
  }

  // Ensure Main also has standard ports + 8080 extra when co-located.
  const main = await p.streamServer.findFirst({
    where: { OR: [{ id: "main" }, { name: "Main Server" }] },
  });
  if (main) {
    const mPrev =
      typeof main.panelSettings === "object" && main.panelSettings ? main.panelSettings : {};
    const mHttp = Array.isArray(mPrev.httpPorts) ? mPrev.httpPorts.map(Number) : [];
    const mergedHttp = [...new Set([80, 8080, ...mHttp.filter((n) => n > 0)])];
    const mHttps = Array.isArray(mPrev.httpsPorts) ? mPrev.httpsPorts.map(Number) : [];
    const mergedHttps = [...new Set([443, ...mHttps.filter((n) => n > 0)])];
    await p.streamServer.update({
      where: { id: main.id },
      data: {
        port: Number(main.port) === 8090 ? 80 : main.port || 80,
        httpsPort: main.httpsPort || 443,
        panelSettings: {
          ...mPrev,
          httpPorts: mergedHttp,
          httpsPorts: mergedHttps,
        },
      },
    });
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
    // Internal edge for panel nginx proxy + connections sync (not server_info.port).
    val.remoteLiveUpstream = `${host}:${internalPort}`;
    // Prefer loopback when LB is on this host (co-located XUI).
    const os = require("os");
    const ifaces = Object.values(os.networkInterfaces() || {}).flat();
    const localIps = new Set(
      ifaces.filter((i) => i && i.family === "IPv4").map((i) => i.address)
    );
    localIps.add("127.0.0.1");
    const connHost = localIps.has(host) ? "127.0.0.1" : host;
    val.classicLbConnectionsUrl = `http://${connHost}:${internalPort}`;
    val.streamHttpPort = advertisedPort;
    val.streamHttpsPort = httpsPort;
    val.connectionHandler = process.env.CONNECTION_HANDLER || val.connectionHandler || "mysql";
    await p.panelSetting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(val) },
      update: { value: JSON.stringify(val) },
    });
    console.log(
      JSON.stringify(
        {
          topology: "classic-lb",
          remoteLiveUpstream: val.remoteLiveUpstream,
          classicLbConnectionsUrl: val.classicLbConnectionsUrl,
          advertisedPort,
        },
        null,
        2
      )
    );
  }

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
