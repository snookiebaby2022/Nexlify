#!/usr/bin/env node
/** Burst pulls from panel; poll edge TX every 3s via SSH. */
const http = require("http");
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const N = 280;
const DUR = 30;
const BASE = "http://bladesmedia2.darkcdn.win:8080";
const STREAMS = [
  "cmthfbgvf008rvh5m3625mz0a",
  "cmth8j9st0saivhrennsfvu3t",
  "cmth8j9su0sauvhreldconccb",
  "cmth3athw019cvho6q8dk93ig",
  "cmthfbgvf008uvh5mr7f119xs",
  "cmth8j9st0salvhrei6vlyzs8",
  "cmth6bhfv0dtjvhrejvxxu1cb",
  "cmth8j9st0saovhrekewswzdl",
];

const RATE_PY_B64 = Buffer.from(`import time
IFACE='enp45s0'
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith(IFACE+':'):
      c=line.replace(':',' ').split(); return int(c[1]), int(c[9])
  return 0,0
a=n(); time.sleep(2); b=n()
print(round((b[0]-a[0])*8/2/1e9,3), round((b[1]-a[1])*8/2/1e9,3))
`).toString("base64");

(async () => {
  const prisma = new PrismaClient();
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
      encoding: "utf8",
    }).trim()
  );
  const s = await get10gbsServer(prisma);

  async function edgeSample() {
    return withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
      const r = await sshExec(c, `echo '${RATE_PY_B64}' | base64 -d > /tmp/edge_rate.py && python3 /tmp/edge_rate.py`);
      return (r.stdout || "").trim();
    });
  }

  console.log("edge_before", await edgeSample());

  const jobs = [];
  for (let i = 0; i < N; i++) {
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
        }, DUR * 1000 + 2000);
        req = http.get(url, { timeout: DUR * 1000 + 3000, headers: { "User-Agent": "VLC/3.0.20" } }, (res) => {
          code = res.statusCode || 0;
          res.on("data", (c) => {
            if (!sync && c[0] === 0x47) sync = true;
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
          resolve({ ok: false, mbps: 0, stalls });
        });
        function done() {
          if (done.x) return;
          done.x = true;
          clearTimeout(timer);
          const elapsed = Math.max(0.001, (Date.now() - t0) / 1000);
          resolve({ ok: code === 200 && sync && bytes > 65536, mbps: (bytes * 8) / elapsed / 1e6, stalls });
        }
      })
    );
  }

  const samples = [];
  const poll = (async () => {
    for (let i = 0; i < 8; i++) {
      try {
        samples.push(await edgeSample());
        console.log("edge_mid", samples[samples.length - 1]);
      } catch (e) {
        console.log("edge_mid_err", e.message);
      }
    }
  })();

  const rows = await Promise.all(jobs);
  await poll;
  console.log("edge_after", await edgeSample());

  const ok = rows.filter((r) => r.ok).length;
  const agg = rows.reduce((s, r) => s + r.mbps, 0);
  console.log(
    JSON.stringify({
      n: N,
      ok,
      fail: N - ok,
      aggregateMbps: Math.round(agg * 10) / 10,
      stalls: rows.reduce((s, r) => s + r.stalls, 0),
      edgeSamples: samples,
    })
  );

  const txs = samples
    .map((s) => Number(String(s).split(/\s+/)[1]))
    .filter((n) => Number.isFinite(n));
  if (txs.length) {
    console.log("edge_peak_tx_gbps", Math.max(...txs).toFixed(3));
    console.log("edge_avg_tx_gbps", (txs.reduce((a, b) => a + b, 0) / txs.length).toFixed(3));
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
