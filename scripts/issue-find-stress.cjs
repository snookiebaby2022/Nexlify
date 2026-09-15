#!/usr/bin/env node
/**
 * Best-effort issue-finding stress from panel → edge IP.
 * Not a true 8Gbps proof (needs external VPS). Aborts on hard degradation.
 */
const http = require("http");
const { execSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

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
  { n: 50, dur: 18, label: "step_50" },
  { n: 100, dur: 22, label: "step_100" },
  { n: 200, dur: 25, label: "step_200" },
  { n: 320, dur: 25, label: "step_320" },
];

const issues = [];
function note(msg) {
  issues.push(msg);
  console.log("ISSUE:", msg);
}

function panelRate(sec = 2) {
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

async function edgeCmd(s, cmd, timeoutMs = 30000) {
  return withSshClient(
    { host: s.host, port: s.port, username: s.user, password: s.password },
    (c) => sshExec(c, cmd, { timeoutMs })
  );
}

async function edgeRate(s) {
  const r = await edgeCmd(
    s,
    `python3 -c "import time
IFACE='enp45s0'
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith(IFACE+':'):
      c=line.replace(':',' ').split(); return int(c[1]),int(c[9])
  return 0,0
a=n(); time.sleep(2); b=n()
print(round((b[0]-a[0])*8/2/1e9,3), round((b[1]-a[1])*8/2/1e9,3))"`
  );
  return (r.stdout || "").trim();
}

function probeOne(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let code = 0,
      bytes = 0,
      sync = false,
      req;
    const timer = setTimeout(() => {
      try {
        req.destroy();
      } catch {}
      resolve({ ok: false, code, ttfbMs: Date.now() - t0, bytes, err: "timeout" });
    }, timeoutMs);
    req = http.get(url, { timeout: timeoutMs, headers: { "User-Agent": "VLC/3.0.20" } }, (res) => {
      code = res.statusCode || 0;
      const ttfbMs = Date.now() - t0;
      res.on("data", (c) => {
        bytes += c.length;
        if (!sync) {
          for (let i = 0; i < c.length; i++) if (c[i] === 0x47) {
            sync = true;
            break;
          }
        }
        if (bytes > 200000) {
          try {
            req.destroy();
          } catch {}
        }
      });
      res.on("end", finish);
      res.on("close", finish);
      function finish() {
        if (finish.x) return;
        finish.x = true;
        clearTimeout(timer);
        resolve({
          ok: code === 200 && sync && bytes > 50000,
          code,
          ttfbMs,
          bytes,
          err: null,
        });
      }
    });
    req.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: 0, ttfbMs: Date.now() - t0, bytes, err: e.message });
    });
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
              for (let i = 0; i < c.length; i++) if (c[i] === 0x47) {
                sync = true;
                break;
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
          resolve({ ok: false, mbps: 0, stalls, ttfb: Date.now() - t0, code: 0 });
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
    execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim()
  );
  const s = await get10gbsServer(prisma);

  console.log("=== ISSUE-FIND STRESS ===");
  console.log(JSON.stringify({ base: BASE, mediaOrigin: process.env.NEXLIFY_MEDIA_ORIGIN || null, evening: true }, null, 2));

  // Precheck
  const dig = execSync("dig +short A bladesmedia2.darkcdn.win 2>/dev/null | head -3", { encoding: "utf8" }).trim();
  console.log("dns_bladesmedia2=", dig.replace(/\n/g, " "));
  if (/^(104\.|172\.67\.|188\.114\.)/m.test(dig)) {
    note("bladesmedia2.darkcdn.win still Cloudflare-proxied — grey-cloud DNS or keep using IP origin");
  }
  const hdr = execSync(`curl -sS -m 5 -D - -o /dev/null ${BASE}/ 2>&1 | tr -d '\\r' | head -12`, {
    encoding: "utf8",
  });
  console.log("edge_root_headers:\n" + hdr);
  if (/cf-ray/i.test(hdr)) note("Direct edge IP unexpectedly shows Cloudflare headers");

  const nic = await edgeCmd(s, "ethtool enp45s0 2>/dev/null | grep -i Speed; cat /sys/class/net/enp45s0/speed 2>/dev/null");
  console.log("edge_nic:", (nic.stdout || "").trim());
  if (!/10000/.test(nic.stdout || "")) note("enp45s0 not reporting 10000Mb/s");

  const baselineEdge = await edgeRate(s);
  const baselinePanel = panelRate(3);
  console.log("baseline_edge_rx_tx_gbps", baselineEdge);
  console.log("baseline_panel_rx_tx_gbps", baselinePanel);

  // Quality probe
  console.log("\n=== QUALITY PROBE (8 streams) ===");
  const quality = [];
  for (let i = 0; i < 8; i++) {
    const url = `${BASE}/live/${creds.u}/${encodeURIComponent(creds.p)}/${STREAMS[i]}.ts`;
    const r = await probeOne(url, 10000);
    quality.push(r);
    console.log(
      `stream_${i}`,
      JSON.stringify({ ok: r.ok, code: r.code, ttfbMs: r.ttfbMs, bytes: r.bytes, err: r.err })
    );
  }
  const qFail = quality.filter((q) => !q.ok).length;
  const qSlow = quality.filter((q) => q.ok && q.ttfbMs > 2000).length;
  if (qFail) note(`Quality probe: ${qFail}/8 streams failed before load`);
  if (qSlow) note(`Quality probe: ${qSlow}/8 streams TTFB >2s before load`);

  // Progressive load
  const results = [];
  let maxEdgeTx = 0;
  for (const step of STEPS) {
    console.log(`\n=== ${step.label}: ${step.n} clients x ${step.dur}s ===`);
    const edgeSamples = [];
    const poll = (async () => {
      for (let i = 0; i < Math.max(3, Math.floor(step.dur / 7)); i++) {
        try {
          const e = await edgeRate(s);
          edgeSamples.push(e);
          console.log("edge_mid", e);
        } catch (e) {
          console.log("edge_mid_err", e.message);
        }
      }
    })();
    const rows = await pullBatch(creds, step.n, step.dur);
    await poll;
    const ok = rows.filter((r) => r.ok).length;
    const stalls = rows.reduce((a, r) => a + r.stalls, 0);
    const agg = rows.reduce((a, r) => a + r.mbps, 0);
    const codes = {};
    for (const r of rows) codes[String(r.code || 0)] = (codes[String(r.code || 0)] || 0) + 1;
    const txs = edgeSamples.map((x) => Number(String(x).split(/\s+/)[1])).filter(Number.isFinite);
    const peak = txs.length ? Math.max(...txs) : 0;
    maxEdgeTx = Math.max(maxEdgeTx, peak);
    const sys = await edgeCmd(
      s,
      `uptime; free -h | head -2; ss -tn state established '( sport = :8080 )' 2>/dev/null | wc -l; nstat -az TcpRetransSegs 2>/dev/null | tail -1 || true`
    );
    const row = {
      label: step.label,
      n: step.n,
      ok,
      fail: step.n - ok,
      failPct: Math.round(((step.n - ok) / step.n) * 1000) / 10,
      aggregateMbps: Math.round(agg * 10) / 10,
      stalls,
      avgTtfb: Math.round(rows.reduce((a, r) => a + r.ttfb, 0) / rows.length),
      edgePeakTxGbps: peak ? Math.round(peak * 1000) / 1000 : null,
      panel: panelRate(2),
      codes,
      edgeSys: (sys.stdout || "").trim().slice(0, 400),
    };
    results.push(row);
    console.log(JSON.stringify(row, null, 2));

    if (row.failPct > 25) {
      note(`${step.label}: fail rate ${row.failPct}% — aborting higher steps`);
      break;
    }
    if (row.stalls > row.n * 2) {
      note(`${step.label}: stalls exploded (${row.stalls}) — aborting`);
      break;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  // Post quality
  console.log("\n=== QUALITY AFTER LOAD ===");
  let postFail = 0,
    postSlow = 0;
  for (let i = 0; i < 8; i++) {
    const url = `${BASE}/live/${creds.u}/${encodeURIComponent(creds.p)}/${STREAMS[i]}.ts`;
    const r = await probeOne(url, 10000);
    console.log(`post_${i}`, JSON.stringify({ ok: r.ok, code: r.code, ttfbMs: r.ttfbMs, bytes: r.bytes }));
    if (!r.ok) postFail++;
    if (r.ok && r.ttfbMs > 2000) postSlow++;
  }
  if (postFail) note(`After load: ${postFail}/8 streams still failing`);
  if (postSlow) note(`After load: ${postSlow}/8 streams TTFB >2s`);

  // Short panel→edge iperf if available
  console.log("\n=== RAW PATH (iperf3 20s if present) ===");
  try {
    const iperf = await edgeCmd(
      s,
      `command -v iperf3 >/dev/null && (pkill -f 'iperf3 -s' 2>/dev/null; iperf3 -s -p 5209 -1 >/tmp/iperf3s.log 2>&1 &) && sleep 1 && echo iperf_server_ok || echo no_iperf`,
      15000
    );
    console.log((iperf.stdout || "").trim());
    if (/iperf_server_ok/.test(iperf.stdout || "")) {
      const client = execSync("timeout 35 iperf3 -c 209.237.141.15 -p 5209 -t 20 -P 4 2>&1 | tail -20", {
        encoding: "utf8",
      });
      console.log(client);
      const m = client.match(/([\d.]+)\s+Gbits\/sec/);
      if (m && Number(m[1]) < 1.5) note(`Panel→edge iperf only ~${m[1]} Gbits/s (path/NIC contention under production)`);
    }
  } catch (e) {
    console.log("iperf_skip", e.message.slice(0, 200));
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
  console.log(
    JSON.stringify(
      {
        maxEdgeTxGbps: Math.round(maxEdgeTx * 1000) / 1000,
        true8gPossibleHere: false,
        reason: "Only panel+edge available; need 6-8 external 1G VPS off-peak for 8Gbps proof",
        issuesFound: issues,
        issueCount: issues.length,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
  process.exit(issues.some((i) => /fail rate|still failing|exploded/i.test(i)) ? 2 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
