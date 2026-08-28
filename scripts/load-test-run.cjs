#!/usr/bin/env node
/**
 * Simulate concurrent IPTV viewers against panel live URLs (no provider load).
 *
 * Each worker uses its own load-test line (load00001, load00002, …) so maxConnections
 * per line is not the bottleneck. Setup creates 5000 lines via load-test-setup.cjs.
 *
 * Usage:
 *   node scripts/load-test-run.cjs --host=https://darkcdn.store --concurrency=500 --duration=120
 *   node scripts/load-test-run.cjs --host=https://darkcdn.store --concurrency=500 --duration=300 --stream=1796860029 --delay-ms=3000 --lines=5000
 *   node scripts/load-test-run.cjs --host=... --concurrency=500 --method=get  # opens upstream (heavy)
 *   node scripts/load-test-run.cjs --host=... --concurrency=500 --method=head # auth/panel only (safe)
 *
 * When postgres is busy, pass --stream= and --lines= (or --no-db) to skip DB lookups entirely.
 */
const http = require("http");
const https = require("https");
require("./load-env.cjs").loadEnv();

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.split("=")[1];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const host = String(parseArg("host", "http://127.0.0.1:3000")).replace(/\/$/, "");
const concurrency = Math.min(Number(parseArg("concurrency", "100")) || 100, 5000);
const durationSec = Number(parseArg("duration", "60")) || 60;
const delayMs = Math.max(0, Math.floor(Number(parseArg("delay-ms", "0")) || 0));
const useTestIp = !process.argv.includes("--no-test-ip");
const reqMethodRaw = String(parseArg("method", "head") || "head").toLowerCase();
if (reqMethodRaw === "get" && !process.argv.includes("--force-get")) {
  console.error("Refusing --method=get (opens real upstreams). Use HEAD, or pass --force-get.");
  process.exit(1);
}
const reqMethod = reqMethodRaw === "get" ? "GET" : "HEAD";
const singleUser = parseArg("user", "");
const singlePass = parseArg("pass", "");
const streamNum = parseArg("stream", "");
const linePoolArg = parseArg("lines", "");
const noDb = process.argv.includes("--no-db") || Boolean(streamNum);

function prismaClient() {
  const { PrismaClient } = require("@prisma/client");
  let url = process.env.DATABASE_URL || "";
  if (url && !/connection_limit=/i.test(url)) {
    url += `${url.includes("?") ? "&" : "?"}connection_limit=1&pool_timeout=10`;
  }
  return url
    ? new PrismaClient({ datasources: { db: { url } } })
    : new PrismaClient();
}

async function withPrisma(fn) {
  const p = prismaClient();
  try {
    return await fn(p);
  } finally {
    await p.$disconnect().catch(() => {});
  }
}

async function loadStreamIds() {
  if (streamNum) return [streamNum];
  if (noDb) {
    console.error("No --stream= and --no-db set — cannot resolve streams without DB.");
    return [];
  }
  try {
    return await withPrisma(async (p) => {
      const rows = await p.stream.findMany({
        where: { name: { startsWith: "Load Test Stream " } },
        select: { xtreamNum: true },
        orderBy: { name: "asc" },
        take: 10,
      });
      return rows.map((r) => String(r.xtreamNum)).filter(Boolean);
    });
  } catch (e) {
    console.error("[load-test] DB stream lookup failed:", e.message || e);
    console.error("Pass --stream=XTREAM_NUM (and --lines=N) to run without postgres.");
    return [];
  }
}

async function countLoadLines() {
  if (linePoolArg) return Number(linePoolArg) || concurrency;
  if (noDb) return concurrency;
  try {
    return await withPrisma(async (p) => {
      return p.line.count({ where: { notes: { contains: "loadtest-v2053" } } });
    });
  } catch (e) {
    console.warn("[load-test] DB line count failed — assuming line pool = concurrency:", e.message || e);
    return concurrency;
  }
}

function credentialsForSlot(slot, linePoolSize) {
  if (singleUser) {
    return {
      username: singleUser,
      password: singlePass || "lt1",
    };
  }
  const num = (slot % linePoolSize) + 1;
  return {
    username: `load${String(num).padStart(5, "0")}`,
    password: `lt${num}`,
  };
}

function testIpForSlot(slot) {
  // RFC5737 TEST-NET-3 — panel treats as smoke/load-test (no LiveConnection rows).
  return `203.0.113.${(slot % 254) + 1}`;
}

function fetchOnce(url, slot) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const headers = {
      "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
      Accept: "*/*",
    };
    if (useTestIp) {
      headers["X-Forwarded-For"] = testIpForSlot(slot);
    }
    const req = lib.request(
      url,
      {
        method: reqMethod,
        headers,
        timeout: 15000,
      },
      (res) => {
        res.resume();
        res.on("end", () =>
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode ?? 0 })
        );
      }
    );
    req.on("error", () => resolve({ ok: false, status: 0 }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0 });
    });
    req.end();
  });
}

async function cleanupLoadTestConnections() {
  if (noDb || process.argv.includes("--no-cleanup")) return;
  try {
    await withPrisma(async (p) => {
      const lines = await p.line.findMany({
        where: { notes: { contains: "loadtest-v2053" } },
        select: { id: true },
        take: 5000,
      });
      if (!lines.length) return;
      const r = await p.liveConnection.deleteMany({
        where: { lineId: { in: lines.map((l) => l.id) } },
      });
      console.log(`[load-test] cleaned ${r.count} load-test LiveConnection row(s)`);
    });
  } catch (e) {
    console.warn("[load-test] cleanup skip:", e.message || e);
  }
}

(async () => {
  const streamIds = await loadStreamIds();
  if (!streamIds.length) {
    console.error("No load-test streams found. Run load-test-setup.cjs first or pass --stream=ID.");
    process.exit(1);
  }

  const availableLines = singleUser ? 1 : await countLoadLines();
  if (!singleUser && availableLines < concurrency && !noDb) {
    console.warn(
      `Warning: only ${availableLines} load-test lines in DB but concurrency=${concurrency}. ` +
        `Workers will share lines — run load-test-setup.cjs --lines=${concurrency} first.`
    );
  }
  const linePoolSize = singleUser
    ? 1
    : Math.min(concurrency, Math.max(1, Number(linePoolArg) || availableLines || concurrency));

  let active = 0;
  let ok = 0;
  let fail = 0;
  let total = 0;
  const statusCounts = {};
  const endAt = Date.now() + durationSec * 1000;

  function noteStatus(status) {
    const key = String(status);
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }

  async function worker(slot) {
    const { username, password } = credentialsForSlot(slot, linePoolSize);
    while (Date.now() < endAt) {
      const sid = streamIds[slot % streamIds.length];
      const u = `${host}/live/${username}/${password}/${sid}.ts`;
      active++;
      const result = await fetchOnce(u, slot);
      active--;
      total++;
      if (result.ok) ok++;
      else {
        fail++;
        noteStatus(result.status);
      }
      if (delayMs > 0 && Date.now() < endAt) {
        await sleep(delayMs);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        host,
        concurrency,
        durationSec,
        delayMs,
        method: reqMethod,
        useTestIp,
        noDb,
        streams: streamIds.length,
        mode: singleUser ? "single-line" : "one-line-per-worker",
        linePoolSize,
        sampleLine: singleUser
          ? { username: singleUser, password: singlePass || "lt1" }
          : { username: "load00001", password: "lt1" },
      },
      null,
      2
    )
  );

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i));
  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`\n[load-test] ${signal} — cleaning load-test connections…`);
    clearInterval(ticker);
    await cleanupLoadTestConnections();
    process.exit(0);
  }
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  const ticker = setInterval(() => {
    console.log(
      `[${new Date().toISOString()}] active=${active} total=${total} ok=${ok} fail=${fail}`
    );
  }, 5000);

  await Promise.all(workers);
  clearInterval(ticker);
  await cleanupLoadTestConnections();
  console.log(
    JSON.stringify(
      {
        done: true,
        total,
        ok,
        fail,
        successRate: total ? ok / total : 0,
        failStatusCounts: statusCounts,
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
