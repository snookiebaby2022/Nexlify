#!/usr/bin/env node
const http = require("http");
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const N = 220;
const DUR = 35;
const BASE = "http://bladesmedia2.darkcdn.win:8080";
const STREAMS = [
  "cmthfbgvf008rvh5m3625mz0a",
  "cmth8j9st0saivhrennsfvu3t",
  "cmth8j9su0sauvhreldconccb",
  "cmth3athw019cvho6q8dk93ig",
  "cmthfbgvf008uvh5mr7f119xs",
];

const PY = `import time
IFACE='enp45s0'
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith(IFACE+':'):
      c=line.replace(':',' ').split(); return int(c[1]), int(c[9])
  return 0,0
open('/tmp/edge_nic_live.csv','w').write('t,rx_gbps,tx_gbps\\n')
prev=n(); t0=time.time()
while time.time()-t0 < 55:
  time.sleep(1)
  cur=n()
  rx=(cur[0]-prev[0])*8/1e9; tx=(cur[1]-prev[1])*8/1e9
  open('/tmp/edge_nic_live.csv','a').write('%d,%.4f,%.4f\\n' % (int(time.time()), rx, tx))
  prev=cur
`;

(async () => {
  const prisma = new PrismaClient();
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
      encoding: "utf8",
    }).trim()
  );
  const s = await get10gbsServer(prisma);
  const b64 = Buffer.from(PY).toString("base64");

  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      `pkill -f edge_nic_live.py 2>/dev/null || true; echo '${b64}' | base64 -d > /tmp/edge_nic_live.py; nohup python3 /tmp/edge_nic_live.py >/tmp/edge_nic_live.log 2>&1 & sleep 1; wc -l /tmp/edge_nic_live.csv; pgrep -af edge_nic_live | head -2`
    );
    console.log("sampler", r.stdout.trim(), "code", r.code);
  });

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

  const rows = await Promise.all(jobs);
  const ok = rows.filter((r) => r.ok).length;
  const agg = rows.reduce((s, r) => s + r.mbps, 0);
  console.log(JSON.stringify({ n: N, ok, fail: N - ok, aggregateMbps: Math.round(agg * 10) / 10, stalls: rows.reduce((s, r) => s + r.stalls, 0) }));

  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      `python3 -c "rows=[tuple(map(float,l.split(',')[1:])) for l in open('/tmp/edge_nic_live.csv').read().splitlines()[1:] if l.strip()]; print('peak_rx', round(max(r for r,_ in rows),3)); print('peak_tx', round(max(t for _,t in rows),3)); print('avg_tx', round(sum(t for _,t in rows)/len(rows),3)); print('n', len(rows)); print('top', sorted((t for _,t in rows), reverse=True)[:5])"; pkill -f edge_nic_live.py 2>/dev/null || true`
    );
    console.log(r.stdout.trim());
    if (r.stderr) console.log("stderr", r.stderr.slice(0, 300));
  });

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
