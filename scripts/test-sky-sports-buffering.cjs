#!/usr/bin/env node
/** Sustained live playback probe for UK Sky Sports — detects stalls / low bitrate. */
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();

const UA = "VLC/3.0.20 LibVLC/3.0.20";
const SAMPLE_SEC = 22;
const CHUNK_MS = 2000;

const TEST_STREAMS = [
  { id: "cmthfbgvf008rvh5m3625mz0a", label: "Main Event FHD" },
  { id: "cmthfbgvf008uvh5mr7f119xs", label: "Premier League FHD" },
  { id: "cmth8j9st0saivhrennsfvu3t", label: "Football FHD" },
  { id: "cmth8j9su0sauvhreldconccb", label: "Action FHD" },
  { id: "cmth3athw019cvho6q8dk93ig", label: "News FHD" },
  { id: "cmth8j9st0salvhrei6vlyzs8", label: "Cricket FHD" },
  { id: "cmth6bhfv0dtjvhrejvxxu1cb", label: "Golf FHD" },
  { id: "cmth8j9st0saovhrekewswzdl", label: "F1 FHD" },
];

const ROUTES = [];

function addRoute(name, base) {
  const b = String(base || "").replace(/\/+$/, "");
  if (b) ROUTES.push({ name, base: b });
}

(async () => {
  const p = new PrismaClient();
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
      encoding: "utf8",
    }).trim()
  );

  const servers = await p.streamServer.findMany({
    where: { isActive: true },
    select: { name: true, host: true, domain: true, port: true, protocol: true },
  });
  const edge = servers.find((s) => s.name === "10gbs");
  const mediaOrigin = String(process.env.NEXLIFY_MEDIA_ORIGIN || "").trim();

  addRoute("media_origin", mediaOrigin);
  if (edge?.domain) addRoute("lb_domain", `${edge.protocol || "http"}://${edge.domain}:${edge.port || 8080}`);
  if (edge?.host) addRoute("edge_ip", `${edge.protocol || "http"}://${edge.host}:${edge.port || 8080}`);
  addRoute("panel_nginx_8080", "http://127.0.0.1:8080");

  console.log("=== routes ===");
  for (const r of ROUTES) console.log(`${r.name}: ${r.base}`);

  const results = [];

  for (const stream of TEST_STREAMS) {
    for (const route of ROUTES) {
      const path = `/live/${creds.u}/${creds.p}/${stream.id}.ts`;
      const url = `${route.base}${path}`;
      const sample = await probeStream(url);
      results.push({ stream: stream.label, route: route.name, url, ...sample });
      const flag = sample.ok ? (sample.stalls > 0 || sample.avgMbps < 2 ? "WARN" : "OK") : "FAIL";
      console.log(
        `[${flag}] ${stream.label} @ ${route.name}: code=${sample.code} ttfb=${sample.ttfbMs}ms avg=${sample.avgMbps}Mbps min=${sample.minMbps}Mbps stalls=${sample.stalls} sync=${sample.syncOk}`
      );
    }
  }

  console.log("\n=== summary ===");
  const byStream = new Map();
  for (const r of results) {
    if (!byStream.has(r.stream)) byStream.set(r.stream, []);
    byStream.get(r.stream).push(r);
  }
  for (const [name, rows] of byStream) {
    const best = rows.filter((r) => r.ok).sort((a, b) => b.avgMbps - a.avgMbps)[0];
    const worst = rows.filter((r) => r.ok).sort((a, b) => a.avgMbps - b.avgMbps)[0];
    const failed = rows.filter((r) => !r.ok);
    console.log(
      `${name}: ok=${rows.filter((r) => r.ok).length}/${rows.length}` +
        (best ? ` best=${best.route}@${best.avgMbps}Mbps` : "") +
        (worst && worst !== best ? ` worst=${worst.route}@${worst.avgMbps}Mbps stalls=${worst.stalls}` : "") +
        (failed.length ? ` failed=${failed.map((f) => f.route).join(",")}` : "")
    );
  }

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

function probeStream(urlStr) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return resolve({ ok: false, code: 0, error: e.message, ttfbMs: 0, avgMbps: 0, minMbps: 0, stalls: 0, syncOk: false, bytes: 0 });
    }
    const lib = u.protocol === "https:" ? https : http;
    const started = Date.now();
    let ttfbMs = 0;
    let bytes = 0;
    let syncOk = false;
    const windows = [];
    let winStart = Date.now();
    let winBytes = 0;
    let stalls = 0;
    let lastData = Date.now();
    const timer = setTimeout(() => req.destroy(), SAMPLE_SEC * 1000 + 5000);

    const req = lib.get(
      urlStr,
      { timeout: SAMPLE_SEC * 1000 + 8000, headers: { "User-Agent": UA, Range: "bytes=0-" } },
      (res) => {
        if (!ttfbMs) ttfbMs = Date.now() - started;
        res.on("data", (chunk) => {
          if (!syncOk && chunk[0] === 0x47) syncOk = true;
          bytes += chunk.length;
          winBytes += chunk.length;
          const now = Date.now();
          if (now - winStart >= CHUNK_MS) {
            const sec = (now - winStart) / 1000;
            const mbps = sec > 0 ? (winBytes * 8) / sec / 1e6 : 0;
            windows.push(mbps);
            if (mbps < 0.5 && winBytes > 0) stalls += 1;
            winStart = now;
            winBytes = 0;
          }
          lastData = now;
        });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", () => finish());
      }
    );
    req.on("error", (e) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: 0,
        error: e.message,
        ttfbMs,
        avgMbps: 0,
        minMbps: 0,
        stalls,
        syncOk,
        bytes,
      });
    });

    function finish() {
      if (finish.done) return;
      finish.done = true;
      clearTimeout(timer);
      if (winBytes > 0) {
        const sec = (Date.now() - winStart) / 1000;
        const mbps = sec > 0 ? (winBytes * 8) / sec / 1e6 : 0;
        windows.push(mbps);
        if (mbps < 0.5 && winBytes > 0) stalls += 1;
      }
      if (Date.now() - lastData > 3000 && bytes > 0) stalls += 1;
      const elapsed = Math.max(0.001, (Date.now() - started) / 1000);
      const avgMbps = bytes > 0 ? (bytes * 8) / elapsed / 1e6 : 0;
      const minMbps = windows.length ? Math.min(...windows) : 0;
      const code = req.res?.statusCode || 0;
      resolve({
        ok: code === 200 && syncOk && bytes > 65536,
        code,
        ttfbMs: Math.round(ttfbMs),
        avgMbps: round(avgMbps),
        minMbps: round(minMbps),
        stalls,
        syncOk,
        bytes,
        windows: windows.map(round),
      });
    }
  });
}

function round(n) {
  return Math.round(n * 100) / 100;
}
