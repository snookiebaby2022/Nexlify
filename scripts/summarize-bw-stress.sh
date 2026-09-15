#!/usr/bin/env bash
# Summarize prior stress + print clean iperf SUM lines
set -euo pipefail
DIR=$(ls -dt /tmp/bw-stress-* 2>/dev/null | head -1)
echo "dir=$DIR"
echo "=== baseline ==="
cat "$DIR/baseline_panel.txt" 2>/dev/null || true
echo "=== iperf SUM (sender/receiver) ==="
grep -E '\[SUM\].*(sender|receiver)' "$DIR"/iperf_*.txt || true
echo "=== panel NIC during IPTV ==="
awk -F, 'NR>1{if($2>mr)mr=$2; if($3>mt)mt=$3; sr+=$2; st+=$3; n++} END{if(n) printf "peak_rx=%.3f peak_tx=%.3f avg_rx=%.3f avg_tx=%.3f n=%d\n", mr,mt,sr/n,st/n,n}' "$DIR/panel_nic_during_iptv.csv"
echo "=== IPTV batches ==="
grep -E 'label|IPTV batch' "$DIR/summary.log" | head -20
python3 - <<PY
import time
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith('eth0:'):
      c=line.replace(':',' ').split(); return int(c[1]),int(c[9])
  return 0,0
a=n(); time.sleep(3); b=n()
print(f"now_panel RX={(b[0]-a[0])*8/3/1e9:.3f} TX={(b[1]-a[1])*8/3/1e9:.3f} Gbps")
print(f"link={open('/sys/class/net/eth0/speed').read().strip()} Mbps")
PY
