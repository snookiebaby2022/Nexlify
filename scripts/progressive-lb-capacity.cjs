#!/usr/bin/env node
/**
 * Progressive IPTV capacity probe via LB (evening-safe ceiling).
 * Does NOT claim 8Gbps — that needs external load gens off-peak.
 * Ramps 100 → 200 → 400 concurrent pulls; monitors panel + edge NIC.
 */
const http = require("http");
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

// Prefer direct edge IP — bladesmedia2.darkcdn.win is often orange-clouded (CF bottleneck).
const BASE = process.env.LB_BASE || "http://209.237.141.15:8080";
const STREAMS = [
  "cmthfbgvf008rvh5m3625mz0a",
  "cmthfbgvf008uvh5mr7f119xs",
  "cmth8j9st0saivhrennsfvu3t",
  "cmth8j9su0sauvhreldconccb",
  "cmth3athw019cvho6q8dk93ig",
  "cmth8j9st0salvhrei6vlyzs8",
  "cmth6bhfv0dtjvhrejvxxu1cb",
  "cmth8j9st0saovhrekewswzdl",
];
const STEPS = [
  { n: 40, dur: 15, label: "step_40" },
  { n: 80, dur: 20, label: "step_80" },
  { n: 160, dur: 20, label: "step_160" },
];

const EDGE_RATE_B64 = Buffer.from(`import time
IFACE='enp45s0'
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith(IFACE+':'):
      c=line.replace(':',' ').split(); return int(c[1]), int(c[9])
  return 0,0
a=n(); time.sleep(2); b=n()
print(round((b[0]-a[0])*8/2/1e9,3), round((b[1]-a[1])*8/2/1e9,3))
`).toString("base64");

function panelRate(sec = 2) {
  const { execSync } = require("child_process");
  return execSync(
    `python3 -c "import time
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith('eth0:'):
      c=line.replace(':',' ').split(); return int(c[1]),int(c[9])
  return 0,0
a=n(); time.sleep(${sec}); b=n()
print(f'{(b[0]-a[0])*8/${sec}/1e9:.3f} {(b[1]-a[1])*8/${sec}/1e9:.3f}')"`,
    { encoding: "utf8" }
  ).trim();
}

async function edgeSample(s) {
  return withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(c, `echo '${EDGE_RATE_B64}' | base64 -d > /tmp/edge_rate.py && python3 /tmp/edge_rate.py`);
    return (r.stdout || "").trim();
  });
}

function pullBatch(creds, n, durSec) {
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const sid = STREAMS[i % STREAMS.length];
    const url = `${BASE}/live/${creds.u}/${encodeURIComponent(creds.p)}/${sid}.ts`;
    jobs.push(
      new Promise((resolve) => {
        const t0 = Date.now();
        let bytes = 0,
          stalls = 0,
          last = Date.now(),
          code = 0,
          sync = false,
          req;
        const timer = setTimeout(() => {
          try {
            req.destroy();
          } catch {}
        }, durSec * 1000 + 2500);
        req = http.get(url, { timeout: durSec * 1000 + 4000, headers: { "User-Agent": "VLC/3.0.20" } }, (res) => {
          code = res.statusCode || 0;
          res.on("data", (c) => {
            if (!sync) {
              for (let i = 0; i < c.length; i++) {
                if (c[i] === 0x47) {
                  sync = true;
                  break;
                }
              }
            }
            bytes += c.length;
            const now = Date.now();
            if (now - last > 2500) stalls++;
            last = now;
          });
          res.on("end", done);
          res.on("close", done);
        });
        req.on("error", () => {
          clearTimeout(timer);
          resolve({ ok: false, mbps: 0, stalls, ttfb: 0, code: 0, bytes: 0 });
        });
        function done() {
          if (done.x) return;
          done.x = true;
          clearTimeout(timer);
          const elapsed = Math.max(0.001, (Date.now() - t0) / 1000);
          resolve({
            ok: code === 200 && sync && bytes > 65536,
            mbps: (bytes * 8) / elapsed / 1e6,
            stalls,
            ttfb: Date.now() - t0,
            code,
            bytes,
          });
        }
      })
    );
  }
  return Promise.all(jobs);
}

(async () => {
  const prisma = new PrismaClient();
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
      encoding: "utf8",
    }).trim()
  );
  const s = await get10gbsServer(prisma);
  console.log(JSON.stringify({ note: "Progressive probe — not a full 8Gbps test", base: BASE, eveningSafe: true }, null, 2));
  console.log("baseline_panel", panelRate(3));
  console.log("baseline_edge", await edgeSample(s));

  const results = [];
  for (const step of STEPS) {
    console.log(`\n=== ${step.label}: ${step.n} clients x ${step.dur}s ===`);
    const edgeSamples = [];
    const poll = (async () => {
      for (let i = 0; i < Math.max(3, Math.floor(step.dur / 8)); i++) {
        try {
          edgeSamples.push(await edgeSample(s));
          console.log("edge_mid", edgeSamples[edgeSamples.length - 1]);
        } catch (e) {
          console.log("edge_mid_err", e.message);
        }
      }
    })();
    const rows = await pullBatch(creds, step.n, step.dur);
    await poll;
    const ok = rows.filter((r) => r.ok).length;
    const agg = rows.reduce((a, r) => a + r.mbps, 0);
    const stalls = rows.reduce((a, r) => a + r.stalls, 0);
    const txs = edgeSamples.map((x) => Number(String(x).split(/\s+/)[1])).filter(Number.isFinite);
    const codes = {};
    for (const r of rows) {
      const k = String(r.code || 0);
      codes[k] = (codes[k] || 0) + 1;
    }
    const row = {
      label: step.label,
      n: step.n,
      ok,
      fail: step.n - ok,
      aggregateMbps: Math.round(agg * 10) / 10,
      stalls,
      avgTtfb: Math.round(rows.reduce((a, r) => a + r.ttfb, 0) / rows.length),
      edgePeakTxGbps: txs.length ? Math.round(Math.max(...txs) * 1000) / 1000 : null,
      panel: panelRate(2),
      codes,
    };
    results.push(row);
    console.log(JSON.stringify(row));
    // Abort escalation if failure rate > 40% or stalls explode
    if (row.fail / row.n > 0.4 || row.stalls > row.n) {
      console.log("STOP_ESCALATION: degradation detected — not pushing higher during peak");
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
  const maxEdge = Math.max(0, ...results.map((r) => r.edgePeakTxGbps || 0));
  console.log(
    JSON.stringify({
      maxEdgeTxGbps: maxEdge,
      verdict8g: maxEdge >= 7.5 ? "PASS_8G" : maxEdge >= 1.5 ? "PARTIAL_GT_1P5_NEED_EXTERNAL_LOADGENS_FOR_8G" : "UNDER_1P5",
      requirementFor8g: "Need 6–8 external VPS load generators off-peak targeting http://209.237.141.15:8080 (NOT Cloudflare-proxied hostname) while measuring enp45s0 TX",
    })
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
