#!/bin/bash
set +e
echo "=== ss to 10gbs ==="
ss -tn state established dst 209.237.141.15 2>/dev/null | awk 'NR>1{c++} END{print "estab_to_10gbs", c+0}'
echo "=== ss from clients on 80/443/8080 ==="
ss -tn state established '( sport = :80 or sport = :443 or sport = :8080 )' 2>/dev/null | awk 'NR>1{c++} END{print "estab_http_https_8080", c+0}'
echo "=== nginx workers ==="
ps -eo pcpu,pmem,rss,comm --sort=-pcpu | awk 'NR==1 || /nginx/ {print}' | head -20
echo "=== pm2 cpu now ==="
pm2 jlist 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin);
[print(x.get("name"), x.get("pm2_env",{}).get("status"), "cpu=", x.get("monit",{}).get("cpu"), "mem_mb=", round((x.get("monit",{}).get("memory") or 0)/1048576)) for x in d]'
echo "=== postgres count/cpu ==="
ps -C postgres -o pcpu= | awk '{s+=$1; n++} END{print "postgres_procs", n+0, "sum_pcpu", s+0}'
echo "=== node/next ==="
ps -eo pcpu,rss,cmd --sort=-pcpu | awk '/next-server|node / && !/awk/{print}' | head -8
