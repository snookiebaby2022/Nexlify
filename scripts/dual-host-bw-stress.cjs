#!/usr/bin/env node
/** Dual-host: panel pulls N streams from LB; measure panel eth0 + edge eth0 simultaneously. */
const http = require("http");
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const N = Number(process.env.STRESS_N || 300);
const DUR_SEC = Number(process.env.STRESS_DUR || 40);
const BASE = process.env.LB_BASE || "http://bladesmedia2.darkcdn.win:8080";
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

function sampleLocalNic(sec = 2) {
  const { execSync } = require("child_process");
  return execSync(
    `python3 -c "import time
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith('eth0:'):
      c=line.replace(':',' ').split(); return int(c[1]),int(c[9])
  return 0,0
a=n(); time.sleep(${sec}); b=n()
print(f'{(b[0]-a[0])*8/${sec}/1e9:.4f} {(b[1]-a[1])*8/${sec}/1e9:.4f}')"`,
    { encoding: "utf8" }
  ).trim();
}

function probeMany(creds) {
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
          ttfb = 0,
          code = 0,
          sync = false,
          req;
        const timer = setTimeout(() => {
          try {
            req.destroy();
          } catch {}
        }, DUR_SEC * 1000 + 3000);
        req = http.get(url, { timeout: DUR_SEC * 1000 + 5000, headers: { "User-Agent": "VLC/3.0.20" } }, (res) => {
          code = res.statusCode || 0;
          ttfb = Date.now() - t0;
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
        req.on("error", (e) => {
          clearTimeout(timer);
          resolve({ ok: false, err: e.message, mbps: 0, stalls, ttfb });
        });
        function done() {
          if (done.x) return;
          done.x = true;
          clearTimeout(timer);
          const elapsed = Math.max(0.001, (Date.now() - t0) / 1000);
          resolve({
            ok: code === 200 && sync && bytes > 65536,
            mbps: Math.round(((bytes * 8) / elapsed / 1e6) * 100) / 100,
            stalls,
            ttfb,
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
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
      encoding: "utf8",
    }).trim()
  );
  const s = await get10gbsServer(prisma);

  console.log(JSON.stringify({ n: N, durSec: DUR_SEC, base: BASE }, null, 2));
  console.log("baseline_panel_rx_tx_gbps", sampleLocalNic(3));

  // Start edge NIC sampler
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    await sshExec(
      c,
      `pkill -f edge_nic_sample.py 2>/dev/null || true; cat > /tmp/edge_nic_sample.py << 'PY'
import time
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith('eth0:'):
      c=line.replace(':',' ').split(); return int(c[1]),int(c[9])
  return 0,0
open('/tmp/edge_nic_live.csv','w').write('t,rx_gbps,tx_gbps\\n')
prev=n(); t0=time.time()
while time.time()-t0 < ${DUR_SEC + 15}:
  time.sleep(1)
  cur=n()
  rx=(cur[0]-prev[0])*8/1e9; tx=(cur[1]-prev[1])*8/1e9
  open('/tmp/edge_nic_live.csv','a').write(f'{int(time.time())},{rx:.4f},{tx:.4f}\\n')
  prev=cur
PY
nohup python3 /tmp/edge_nic_sample.py >/tmp/edge_nic_sample.log 2>&1 &
echo started`
    );

    const panelSamples = [];
    const panelMon = setInterval(() => {
      try {
        panelSamples.push(sampleLocalNic(1));
      } catch {}
    }, 2000);

    const t0 = Date.now();
    const rows = await probeMany(creds);
    clearInterval(panelMon);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const ok = rows.filter((r) => r.ok).length;
    const agg = rows.reduce((s, r) => s + (r.mbps || 0), 0);
    const stalls = rows.reduce((s, r) => s + (r.stalls || 0), 0);
    console.log(
      JSON.stringify({
        label: "panel_to_lb",
        ok,
        fail: N - ok,
        aggregateMbps: Math.round(agg * 10) / 10,
        stalls,
        wallSec: elapsed,
        avgTtfb: Math.round(rows.reduce((s, r) => s + r.ttfb, 0) / rows.length),
      })
    );

    const panelPeaks = panelSamples
      .map((s) => s.split(" ").map(Number))
      .filter((a) => a.length === 2);
    if (panelPeaks.length) {
      console.log(
        "panel_peak_rx_gbps",
        Math.max(...panelPeaks.map((a) => a[0])).toFixed(3),
        "panel_peak_tx_gbps",
        Math.max(...panelPeaks.map((a) => a[1])).toFixed(3)
      );
    }

    const edge = await sshExec(
      c,
      `python3 - <<'PY'
rows=[]
for line in open('/tmp/edge_nic_live.csv').read().splitlines()[1:]:
  if not line.strip(): continue
  t,rx,tx=line.split(','); rows.append((float(rx),float(tx)))
if not rows: print('edge_no_samples')
else:
  print(f'edge_peak_rx_gbps={max(r for r,_ in rows):.3f}')
  print(f'edge_peak_tx_gbps={max(t for _,t in rows):.3f}')
  print(f'edge_avg_tx_gbps={sum(t for _,t in rows)/len(rows):.3f}')
  print('edge_top_tx=' + ','.join(f'{t:.3f}' for t in sorted((t for _,t in rows), reverse=True)[:5]))
print('edge_link', open('/sys/class/net/eth0/speed').read().strip())
PY
pkill -f edge_nic_sample.py 2>/dev/null || true`
    );
    console.log(edge.stdout.trim());
  });

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
