#!/usr/bin/env bash
# Definitive IPTV bandwidth stress test — panel (45) + edge (10gbs).
# Proves whether path can sustain >1.5 Gbps or is capped near 1 Gbps.
set -euo pipefail
cd /opt/nexlify-panel

EDGE_IP="${EDGE_IP:-209.237.141.15}"
PANEL_IP="${PANEL_IP:-45.88.138.18}"
LB_BASE="${LB_BASE:-http://bladesmedia2.darkcdn.win:8080}"
OUT_DIR="${OUT_DIR:-/tmp/bw-stress-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT_DIR"
LOG="$OUT_DIR/summary.log"
exec > >(tee -a "$LOG") 2>&1

echo "=== IPTV BANDWIDTH STRESS TEST ==="
echo "out=$OUT_DIR"
echo "lb=$LB_BASE edge=$EDGE_IP panel=$PANEL_IP"
date -u

rate_once() {
  local iface="${1:-eth0}"
  local rx1 tx1 rx2 tx2
  read -r rx1 tx1 < <(awk -v i="$iface:" '$1 ~ i {print $2, $10}' /proc/net/dev)
  sleep 2
  read -r rx2 tx2 < <(awk -v i="$iface:" '$1 ~ i {print $2, $10}' /proc/net/dev)
  python3 - <<PY "$rx1" "$tx1" "$rx2" "$tx2"
import sys
rx1,tx1,rx2,tx2=map(int,sys.argv[1:])
dt=2.0
rx=(rx2-rx1)*8/dt/1e9
tx=(tx2-tx1)*8/dt/1e9
print(f"{rx:.3f} {tx:.3f}")
PY
}

echo ""
echo "=== 0. Baseline NIC (panel eth0, Gbps RX TX) ==="
rate_once eth0 | tee "$OUT_DIR/baseline_panel.txt"
echo "link_speed=$(cat /sys/class/net/eth0/speed 2>/dev/null || echo ?)"

echo ""
echo "=== 1. Tooling ==="
command -v iperf3 >/dev/null && echo "iperf3: $(iperf3 -v 2>&1 | head -1)" || {
  echo "installing iperf3..."
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iperf3 >/dev/null
}
command -v iperf3 >/dev/null || { echo "FATAL: no iperf3"; exit 1; }

# Ensure smoke line
SMOKE=$(node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1)
U=$(node -pe "JSON.parse(process.argv[1]).u" "$SMOKE")
P=$(node -pe "JSON.parse(process.argv[1]).p" "$SMOKE")
# Popular UK Sky Sports FHD IDs
STREAMS=(
  cmthfbgvf008rvh5m3625mz0a
  cmthfbgvf008uvh5mr7f119xs
  cmth8j9st0saivhrennsfvu3t
  cmth8j9su0sauvhreldconccb
  cmth3athw019cvho6q8dk93ig
  cmth8j9st0salvhrei6vlyzs8
  cmth6bhfv0dtjvhrejvxxu1cb
  cmth8j9st0saovhrekewswzdl
)

echo ""
echo "=== 2. External path check (iperf.he.net) — provider egress cap? ==="
# Short, parallel; may fail if blocked — non-fatal
timeout 45 iperf3 -c iperf.he.net -p 5201 -t 12 -P 8 -b 0 2>&1 | tee "$OUT_DIR/iperf_he.txt" || \
  timeout 45 iperf3 -c iperf.he.net -t 12 -P 4 2>&1 | tee "$OUT_DIR/iperf_he.txt" || \
  echo "WARN: external iperf.he.net unavailable/blocked"

echo ""
echo "=== 3. Panel ↔ Edge iperf3 (definitive internal 10G path) ==="
# Start iperf3 server on edge via node ssh helper
node - <<'NODE' "$OUT_DIR" "$EDGE_IP"
const outDir = process.argv[2];
const edgeIp = process.argv[3];
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
require("./scripts/load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./scripts/ssh-10gbs-lib.cjs");
(async () => {
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    // install iperf3 on edge if needed
    await sshExec(c, "command -v iperf3 >/dev/null || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iperf3)");
    await sshExec(c, "pkill -x iperf3 2>/dev/null || true; sleep 0.5; nohup iperf3 -s -D -p 5201 >/tmp/iperf3-server.log 2>&1 || true");
    const speed = await sshExec(c, "cat /sys/class/net/eth0/speed 2>/dev/null || echo 0");
    console.log("edge_link_mbps", speed.stdout.trim());
  });
  await p.$disconnect();
})().catch((e) => {
  console.error("edge_setup_fail", e.message);
  process.exit(1);
});
NODE

sleep 2

run_iperf() {
  local label="$1" extra="$2"
  echo "--- iperf $label ---"
  # shellcheck disable=SC2086
  timeout 50 iperf3 -c "$EDGE_IP" -p 5201 -t 15 $extra 2>&1 | tee "$OUT_DIR/iperf_${label}.txt" || echo "iperf $label failed"
  sleep 2
}

run_iperf "1g_cap" "-b 1000M -P 8"
run_iperf "1p4g_cap" "-b 1400M -P 10"
run_iperf "1p5g_cap" "-b 1500M -P 10"
run_iperf "1p6g_cap" "-b 1600M -P 10"
run_iperf "2g_cap" "-b 2000M -P 12"
run_iperf "max_uncapped" "-P 20"

echo ""
echo "=== 4. Concurrent IPTV MPEG-TS via LB (real streams) ==="
export BW_STRESS_OUT="$OUT_DIR"
# Monitor panel NIC during pull storm
python3 - <<'PY' &
import os, time, pathlib
out = pathlib.Path(os.environ["BW_STRESS_OUT"]) / "panel_nic_during_iptv.csv"
iface = "eth0"
def bytes_now():
    rx=tx=0
    for line in open("/proc/net/dev"):
        if line.strip().startswith(iface+":"):
            cols=line.replace(":"," ").split()
            rx,tx=int(cols[1]),int(cols[9])
            break
    return rx,tx
with out.open("w") as f:
    f.write("t,rx_gbps,tx_gbps\n")
    prev=bytes_now(); t0=time.time()
    while time.time()-t0 < 200:
        time.sleep(1)
        cur=bytes_now()
        dt=1.0
        rx=(cur[0]-prev[0])*8/dt/1e9
        tx=(cur[1]-prev[1])*8/dt/1e9
        f.write(f"{int(time.time())},{rx:.4f},{tx:.4f}\n"); f.flush()
        prev=cur
PY
MON_PID=$!

# Also sample TCP retransmits
(
  for i in $(seq 1 90); do
    echo "$(date +%s) $(nstat -az TcpRetransSegs TcpInErrs TcpExtListenDrops 2>/dev/null | awk 'NR>1{printf "%s=%s ",$1,$2}')" >> "$OUT_DIR/tcp_nstat.txt"
    sleep 1
  done
) &
NSTAT_PID=$!

probe_batch() {
  local n="$1" dur="$2" label="$3"
  echo "--- IPTV batch $label: $n concurrent x ${dur}s ---"
  node - <<NODE
const http = require("http");
const streams = [
  "cmthfbgvf008rvh5m3625mz0a",
  "cmthfbgvf008uvh5mr7f119xs",
  "cmth8j9st0saivhrennsfvu3t",
  "cmth8j9su0sauvhreldconccb",
  "cmth3athw019cvho6q8dk93ig",
  "cmth8j9st0salvhrei6vlyzs8",
  "cmth6bhfv0dtjvhrejvxxu1cb",
  "cmth8j9st0saovhrekewswzdl"
];
const n = $n;
const dur = $dur * 1000;
const base = "$LB_BASE";
const u = "$U";
const p = "$P";
const UA = "VLC/3.0.20 LibVLC/3.0.20";
const jobs = [];
for (let i = 0; i < n; i++) {
  const sid = streams[i % streams.length];
  const url = base + "/live/" + u + "/" + encodeURIComponent(p) + "/" + sid + ".ts";
  jobs.push(new Promise((resolve) => {
    const t0 = Date.now();
    let bytes = 0, stalls = 0, last = Date.now(), ttfb = 0, code = 0, sync = false;
    let req;
    const timer = setTimeout(() => { try { req.destroy(); } catch {} }, dur + 3000);
    req = http.get(url, { timeout: dur + 5000, headers: { "User-Agent": UA } }, (res) => {
      code = res.statusCode || 0;
      ttfb = Date.now() - t0;
      res.on("data", (c) => {
        if (!sync && c[0] === 0x47) sync = true;
        bytes += c.length;
        const now = Date.now();
        if (now - last > 2500) stalls++;
        last = now;
      });
      res.on("end", done); res.on("close", done);
    });
    req.on("error", (e) => { clearTimeout(timer); resolve({ ok:false, err:e.message, bytes, stalls, ttfb, code, sync, mbps:0 }); });
    function done() {
      if (done.x) return; done.x = true; clearTimeout(timer);
      const elapsed = Math.max(0.001, (Date.now() - t0) / 1000);
      const mbps = bytes * 8 / elapsed / 1e6;
      resolve({ ok: code===200 && sync && bytes>65536, bytes, stalls, ttfb, code, sync, mbps: Math.round(mbps*100)/100 });
    }
  }));
}
Promise.all(jobs).then((rows) => {
  const ok = rows.filter(r => r.ok).length;
  const agg = rows.reduce((s,r)=>s+(r.mbps||0),0);
  const stall = rows.reduce((s,r)=>s+(r.stalls||0),0);
  const fail = rows.filter(r => !r.ok).length;
  console.log(JSON.stringify({ label: "$label", n, ok, fail, aggregateMbps: Math.round(agg*10)/10, stalls: stall, avgTtfb: Math.round(rows.reduce((s,r)=>s+r.ttfb,0)/rows.length) }));
});
NODE
}

# Ramp: light → medium → heavy (avoid nuking production with 1000 cold fans at once)
probe_batch 40 25 "light_40"
sleep 3
probe_batch 120 30 "medium_120"
sleep 3
probe_batch 250 35 "heavy_250"
sleep 3
# Aggressive fan-out: many viewers on few channels = high aggregate egress from edge
probe_batch 400 40 "stress_400"

kill $MON_PID 2>/dev/null || true
kill $NSTAT_PID 2>/dev/null || true
wait $MON_PID 2>/dev/null || true

echo ""
echo "=== 5. Peak NIC during IPTV (panel) ==="
python3 - <<PY
import pathlib
p=pathlib.Path("$OUT_DIR")/"panel_nic_during_iptv.csv"
rows=[]
for line in p.read_text().splitlines()[1:]:
  if not line.strip(): continue
  t,rx,tx=line.split(",")
  rows.append((float(rx),float(tx)))
if not rows:
  print("no samples")
else:
  mx=max(max(r,t) for r,t in rows)
  avg=sum(max(r,t) for r,t in rows)/len(rows)
  print(f"panel_peak_gbps={mx:.3f} panel_avg_gbps={avg:.3f} samples={len(rows)}")
PY

echo ""
echo "=== 6. Edge NIC sample + cleanup iperf via SSH ==="
node - <<'NODE'
const { PrismaClient } = require("@prisma/client");
require("./scripts/load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./scripts/ssh-10gbs-lib.cjs");
(async () => {
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const cmd = [
      "python3 - <<'PY'",
      "import time",
      "def nbytes():",
      "  for line in open('/proc/net/dev'):",
      "    if line.strip().startswith('eth0:'):",
      "      cols=line.replace(':',' ').split(); return int(cols[1]), int(cols[9])",
      "  return 0,0",
      "a=nbytes(); time.sleep(3); b=nbytes()",
      "rx=(b[0]-a[0])*8/3/1e9; tx=(b[1]-a[1])*8/3/1e9",
      "print(f'edge RX {rx:.3f} TX {tx:.3f} Gbps')",
      "PY",
      "pkill -x iperf3 2>/dev/null || true",
    ].join("\n");
    const rate = await sshExec(c, cmd);
    console.log((rate.stdout || rate.stderr || "").trim());
  });
  await p.$disconnect();
})().catch((e) => console.error(e.message));
NODE

echo ""
echo "=== 7. iperf summary extract ==="
for f in "$OUT_DIR"/iperf_*.txt; do
  [ -f "$f" ] || continue
  name=$(basename "$f" .txt)
  # Prefer receiver/sender bitrate lines
  bit=$(grep -E 'sender|receiver' "$f" | grep -E 'Gbits|Mbits' | tail -4 | tr '\n' '|' || true)
  echo "$name: $bit"
done

echo ""
echo "=== VERDICT HELPER ==="
python3 - <<PY
import re, pathlib, json
out=pathlib.Path("$OUT_DIR")
peaks=[]
for f in out.glob("iperf_*.txt"):
  text=f.read_text(errors="ignore")
  # look for Gbits/sec lines
  for m in re.finditer(r"([\d.]+)\s+Gbits/sec", text):
    peaks.append(float(m.group(1)))
  for m in re.finditer(r"([\d.]+)\s+Mbits/sec", text):
    peaks.append(float(m.group(1))/1000.0)
mx=max(peaks) if peaks else 0
print(f"iperf_peak_gbps={mx:.3f}")
if mx >= 1.5:
  print("VERDICT_IPERF: PASS_GT_1P5_GBPS")
elif mx >= 0.95 and mx < 1.15:
  print("VERDICT_IPERF: CAP_NEAR_1_GBPS")
elif mx > 0:
  print(f"VERDICT_IPERF: PARTIAL_{mx:.2f}_GBPS")
else:
  print("VERDICT_IPERF: NO_DATA")
PY

echo "DONE logs in $OUT_DIR"
date -u
