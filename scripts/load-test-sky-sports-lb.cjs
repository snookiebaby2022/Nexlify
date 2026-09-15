#!/usr/bin/env node
/** 20 concurrent UK Sky Sports viewers via LB hostname — stress test. */
const http = require("http");
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();

const UA = "VLC/3.0.20 LibVLC/3.0.20";
const CONCURRENCY = 20;
const DURATION_SEC = 25;
const LB_BASE = "http://bladesmedia2.darkcdn.win:8080";

const STREAMS = [
  { id: "cmthfbgvf008rvh5m3625mz0a", label: "Main Event FHD" },
  { id: "cmthfbgvf008uvh5mr7f119xs", label: "Premier League FHD" },
  { id: "cmth8j9st0saivhrennsfvu3t", label: "Football FHD" },
  { id: "cmth8j9su0sauvhreldconccb", label: "Action FHD" },
  { id: "cmth3athw019cvho6q8dk93ig", label: "News FHD" },
  { id: "cmth8j9st0salvhrei6vlyzs8", label: "Cricket FHD" },
  { id: "cmth6bhfv0dtjvhrejvxxu1cb", label: "Golf FHD" },
  { id: "cmth8j9st0saovhrekewswzdl", label: "F1 FHD" },
];

function probe(url) {
  return new Promise((resolve) => {
    const started = Date.now();
    let bytes = 0;
    let ttfb = 0;
    let sync = false;
    let stalls = 0;
    let lastAt = Date.now();
    let winBytes = 0;
    let winStart = Date.now();
    const timer = setTimeout(() => req.destroy(), DURATION_SEC * 1000 + 5000);
    const req = http.get(url, { timeout: DURATION_SEC * 1000 + 8000, headers: { "User-Agent": UA } }, (res) => {
      ttfb = Date.now() - started;
      res.on("data", (chunk) => {
        if (!sync && chunk[0] === 0x47) sync = true;
        bytes += chunk.length;
        winBytes += chunk.length;
        const now = Date.now();
        if (now - winStart >= 2000) {
          const mbps = (winBytes * 8) / ((now - winStart) / 1000) / 1e6;
          if (mbps < 0.5 && winBytes > 0) stalls++;
          winStart = now;
          winBytes = 0;
        }
        if (now - lastAt > 3000) stalls++;
        lastAt = now;
      });
      res.on("end", done);
      res.on("close", done);
    });
    req.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message, bytes: 0, ttfb, stalls: 0, sync: false, mbps: 0 });
    });
    function done() {
      if (done.finished) return;
      done.finished = true;
      clearTimeout(timer);
      const elapsed = Math.max(0.001, (Date.now() - started) / 1000);
      const mbps = bytes > 0 ? (bytes * 8) / elapsed / 1e6 : 0;
      resolve({
        ok: (req.res?.statusCode === 200) && sync && bytes > 65536,
        code: req.res?.statusCode || 0,
        bytes,
        ttfb,
        stalls,
        sync,
        mbps: Math.round(mbps * 100) / 100,
      });
    }
  });
}

(async () => {
  const p = new PrismaClient();
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
      encoding: "utf8",
    }).trim()
  );
  const picks = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const s = STREAMS[i % STREAMS.length];
    picks.push({ ...s, idx: i + 1 });
  }
  console.log(`=== ${CONCURRENCY} concurrent viewers via ${LB_BASE} for ${DURATION_SEC}s ===`);
  const t0 = Date.now();
  const results = await Promise.all(
    picks.map(async (s) => {
      const url = `${LB_BASE}/live/${creds.u}/${creds.p}/${s.id}.ts`;
      const r = await probe(url);
      return { ...s, ...r };
    })
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  let ok = 0;
  let totalMbps = 0;
  for (const r of results) {
    if (r.ok) ok++;
    totalMbps += r.mbps || 0;
    const flag = r.ok ? (r.stalls > 0 ? "WARN" : "OK") : "FAIL";
    console.log(
      `[${flag}] #${r.idx} ${r.label}: code=${r.code} ttfb=${r.ttfb}ms avg=${r.mbps}Mbps stalls=${r.stalls} bytes=${r.bytes}${r.error ? ` err=${r.error}` : ""}`
    );
  }
  console.log("\n=== summary ===");
  console.log(`ok=${ok}/${CONCURRENCY} aggregate=${Math.round(totalMbps * 10) / 10}Mbps wall=${elapsed}s`);
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
