#!/usr/bin/env bash
set -euo pipefail
DIR=/tmp/bw-stress-20260906-214327
echo "dir=$DIR"
echo "=== iperf SUM ==="
grep -E '\[SUM\].*(sender|receiver)' "$DIR"/iperf_*.txt || true
echo "=== panel NIC during IPTV ==="
awk -F, 'NR>1{if($2>mr)mr=$2; if($3>mt)mt=$3; sr+=$2; st+=$3; n++} END{if(n) printf "peak_rx=%.3f peak_tx=%.3f avg_rx=%.3f avg_tx=%.3f n=%d\n", mr,mt,sr/n,st/n,n}' "$DIR/panel_nic_during_iptv.csv"
echo "=== IPTV JSON lines ==="
grep '{"label"' "$DIR/summary.log" || true
echo "=== baseline ==="
cat "$DIR/baseline_panel.txt"
