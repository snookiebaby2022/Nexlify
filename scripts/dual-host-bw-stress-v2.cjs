#!/usr/bin/env node
/** Simpler dual measure: start edge sampler, pull from panel, fetch edge peaks. */
const http = require("http");
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const N = Number(process.env.STRESS_N || 280);
const DUR = Number(process.env.STRESS_DUR || 35);
const BASE = "http://bladesmedia2.darkcdn.win:8080";
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
print(f'{(b[0]-a[0])*8/${sec}/1e9:.4f} {(b[1]-a[1])*8/${sec}/1e9:.4f}')"`,
    { encoding: "utf8" }
  ).trim();
}

(async () => {
  const prisma = new PrismaClient();
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
      encoding: "utf8",
    }).trim()
  );
  const s = await get10gbsServer(prisma);

  // 1) Start sampler on edge (short SSH)
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      `pkill -f edge_nic_live.py 2>/dev/null || true
cat > /tmp/edge_nic_live.py << 'EOF'
import time
def n():
  for line in open("/proc/net/dev"):
    if line.strip().startswith("eth0:"):
      c=line.replace(":"," ").split(); return int(c[1]), int(c[9])
  return 0,0
open("/tmp/edge_nic_live.csv","w").write("t,rx_gbps,tx_gbps\\n")
prev=n(); t0=time.time()
while time.time()-t0 < ${DUR + 20}:
  time.sleep(1)
  cur=n()
  rx=(cur[0]-prev[0])*8/1e9; tx=(cur[1]-prev[1])*8/1e9
  open("/tmp/edge_nic_live.csv","a").write("%d,%.4f,%.4f\\n" % (int(time.time()), rx, tx))
  prev=cur
EOF
nohup python3 /tmp/edge_nic_live.py >/tmp/edge_nic_live.log 2>&1 &
echo ok`
    );
    console.log("edge_sampler", r.stdout.trim());
  });

  console.log("baseline_panel", panelRate(3));

  // 2) Pull streams from panel
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
        }, DUR * 1000 + 2500);
        req = http.get(url, { timeout: DUR * 1000 + 4000, headers: { "User-Agent": "VLC/3.0.20" } }, (res) => {
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
          resolve({
            ok: code === 200 && sync && bytes > 65536,
            mbps: (bytes * 8) / elapsed / 1e6,
            stalls,
          });
        }
      })
    );
  }

  const mid = setInterval(() => {
    try {
      console.log("panel_sample", panelRate(1));
    } catch {}
  }, 5000);

  const rows = await Promise.all(jobs);
  clearInterval(mid);
  const ok = rows.filter((r) => r.ok).length;
  const agg = rows.reduce((s, r) => s + r.mbps, 0);
  const stalls = rows.reduce((s, r) => s + r.stalls, 0);
  console.log(
    JSON.stringify({
      n: N,
      ok,
      fail: N - ok,
      aggregateMbps: Math.round(agg * 10) / 10,
      stalls,
    })
  );

  // 3) Fetch edge peaks
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      `python3 - <<'PY'
rows=[]
try:
  for line in open("/tmp/edge_nic_live.csv").read().splitlines()[1:]:
    if not line.strip(): continue
    t,rx,tx=line.split(","); rows.append((float(rx),float(tx)))
except Exception as e:
  print("edge_err", e)
if not rows:
  print("edge_no_samples")
else:
  print("edge_peak_rx_gbps=%.3f" % max(r for r,_ in rows))
  print("edge_peak_tx_gbps=%.3f" % max(t for _,t in rows))
  print("edge_avg_tx_gbps=%.3f" % (sum(t for _,t in rows)/len(rows)))
  print("edge_samples=%d" % len(rows))
print("edge_link=" + open("/sys/class/net/eth0/speed").read().strip())
PY
pkill -f edge_nic_live.py 2>/dev/null || true`
    );
    console.log(r.stdout.trim());
  });

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
