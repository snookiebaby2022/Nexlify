#!/bin/bash
set +e
echo '=== cores/ram ==='
nproc
free -h | head -2
echo '=== load/cpu ==='
uptime
top -b -n 2 -d 1 | head -20
echo '=== top cpu ==='
ps -eo pcpu,pmem,rss,comm --sort=-pcpu | head -18
echo '=== disk ==='
df -h / /opt /var /var/lib/postgresql 2>/dev/null | uniq
echo '=== nic ==='
ip -s link | awk '/^[0-9]+:/{n=$2} /RX:/{getline; rx=$1} /TX:/{getline; tx=$1; print n, "rx_bytes", rx, "tx_bytes", tx}'
echo '=== live conns / ffmpeg ==='
pgrep -c ffmpeg || true
ss -tn | awk 'NR>1{c++} END{print "tcp", c+0}'
echo '=== pm2 ==='
pm2 jlist 2>/dev/null | python3 -c '
import json,sys
a=json.load(sys.stdin)
for x in a:
  e=x.get("pm2_env") or {}
  m=x.get("monit") or {}
  print("%s %s cpu=%s mem_mb=%.0f" % (x.get("name"), e.get("status"), m.get("cpu"), (m.get("memory") or 0)/1024/1024))
'
echo METRICS_OK
