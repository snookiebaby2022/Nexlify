#!/usr/bin/env node
/** Edge-local egress stress: many clients pull from 127.0.0.1:8080 on 10gbs; measure eth0 TX. */
const { PrismaClient } = require("@prisma/client");
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

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

(async () => {
  const prisma = new PrismaClient();
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
      encoding: "utf8",
    }).trim()
  );
  const s = await get10gbsServer(prisma);
  const urls = [];
  for (let i = 0; i < 350; i++) {
    const sid = STREAMS[i % STREAMS.length];
    urls.push(`http://127.0.0.1:8080/live/${creds.u}/${encodeURIComponent(creds.p)}/${sid}.ts`);
  }
  const urlList = urls.join("\n");

  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    await sshExec(c, "cat > /tmp/edge-urls.txt", { stdin: urlList + "\n" });
    const script = `#!/bin/bash
set -e
OUT=/tmp/edge-egress-$$
mkdir -p "$OUT"
python3 - <<'PY' &
import time
def nbytes():
  for line in open('/proc/net/dev'):
    if line.strip().startswith('eth0:'):
      cols=line.replace(':',' ').split(); return int(cols[1]), int(cols[9])
  return 0,0
open('/tmp/edge_nic.csv','w').write('t,rx_gbps,tx_gbps\\n')
prev=nbytes(); t0=time.time()
while time.time()-t0 < 55:
  time.sleep(1)
  cur=nbytes()
  rx=(cur[0]-prev[0])*8/1e9; tx=(cur[1]-prev[1])*8/1e9
  open('/tmp/edge_nic.csv','a').write(f'{int(time.time())},{rx:.4f},{tx:.4f}\\n')
  prev=cur
PY
MON=$!
# launch 350 curls, each lasting ~45s
while IFS= read -r u; do
  timeout 45 curl -s -o /dev/null -A 'VLC/3.0.20' "$u" &
done < /tmp/edge-urls.txt
wait
kill $MON 2>/dev/null || true
python3 - <<'PY'
rows=[]
for line in open('/tmp/edge_nic.csv').read().splitlines()[1:]:
  if not line.strip(): continue
  t,rx,tx=line.split(',')
  rows.append((float(rx),float(tx)))
if not rows:
  print('no samples')
else:
  mx=max(tx for _,tx in rows)
  avg=sum(tx for _,tx in rows)/len(rows)
  print(f'edge_peak_tx_gbps={mx:.3f} edge_avg_tx_gbps={avg:.3f} samples={len(rows)}')
  print('top5_tx=' + ','.join(f'{tx:.3f}' for tx in sorted((t for _,t in rows), reverse=True)[:5]))
PY
cat /sys/class/net/eth0/speed 2>/dev/null || true
`;
    await sshExec(c, "cat > /tmp/edge-egress-stress.sh", { stdin: script });
    console.log("running 350 local pulls on edge for ~45s...");
    const r = await sshExec(c, "bash /tmp/edge-egress-stress.sh", { timeoutMs: 180000 });
    console.log(r.stdout);
    if (r.stderr) console.error(r.stderr.slice(0, 500));
  });
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
