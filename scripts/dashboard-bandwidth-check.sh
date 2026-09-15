#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel

rate_nic() {
  local iface="${1:-eth0}"
  local rx1 tx1 rx2 tx2
  read -r rx1 tx1 < <(awk -v i="$iface:" '$1 ~ i {print $2, $10}' /proc/net/dev)
  sleep 8
  read -r rx2 tx2 < <(awk -v i="$iface:" '$1 ~ i {print $2, $10}' /proc/net/dev)
  python3 - <<PY "$rx1" "$tx1" "$rx2" "$tx2"
import sys
rx1, tx1, rx2, tx2 = map(int, sys.argv[1:])
dt = 8
rx = (rx2 - rx1) * 8 / dt / 1_000_000
tx = (tx2 - tx1) * 8 / dt / 1_000_000
print(f"RX {rx:.1f} Mbps  TX {tx:.1f} Mbps")
PY
}

echo "=== panel eth0 ($(cat /sys/class/net/eth0/speed 2>/dev/null || echo ?) Mbps link) ==="
rate_nic eth0

echo "=== edge eth0 via ssh ==="
node - <<'NODE'
const { PrismaClient } = require("@prisma/client");
require("./scripts/load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./scripts/ssh-10gbs-lib.cjs");
(async () => {
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const speed = await sshExec(c, "cat /sys/class/net/eth0/speed 2>/dev/null || echo 0");
    const rate = await sshExec(
      c,
      `bash -lc 'read rx1 tx1 < <(awk '\\''$1 ~ \"eth0:\" {print \\$2, \\$10}'\\'' /proc/net/dev); sleep 8; read rx2 tx2 < <(awk '\\''$1 ~ \"eth0:\" {print \\$2, \\$10}'\\'' /proc/net/dev); python3 - <<PY "$rx1" "$tx1" "$rx2" "$tx2"
import sys
rx1, tx1, rx2, tx2 = map(int, sys.argv[1:])
dt = 8
rx = (rx2 - rx1) * 8 / dt / 1_000_000
tx = (tx2 - tx1) * 8 / dt / 1_000_000
print(f"RX {rx:.1f} Mbps  TX {tx:.1f} Mbps")
PY'`
    );
    console.log("link", speed.stdout.trim(), "Mbps");
    console.log(rate.stdout.trim());
    const pm2 = await sshExec(c, "pm2 jlist 2>/dev/null | node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const e=j.find(x=>x.name==='nexlify-iptv-edge');console.log('edge_clients', e?.pm2_env?.axm_monitor?.['Live connections']||'?');});\"");
    console.log(pm2.stdout.trim());
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
NODE

echo "=== dashboard math check ==="
node - <<'NODE'
const { PrismaClient } = require("@prisma/client");
require("./scripts/load-env.cjs").loadEnv();
(async () => {
  const p = new PrismaClient();
  const live = await p.connectionPulse.count({ where: { endedAt: null, stream: { type: "LIVE" } } });
  const est = Math.round(live * 2.5 * 10) / 10;
  console.log("live_connections", live, "estimated_playback_mbps", est);
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
NODE

echo "=== nginx /live/ requests last 60s (if logged) ==="
find /var/log/nginx -name '*.log' -mmin -1 2>/dev/null | head -3
