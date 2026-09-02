#!/bin/bash
set -euo pipefail

echo "=== LINE snooki lookup ==="
sudo -u postgres psql -d nexlify -c "SELECT username, status, \"expiresAt\", \"maxConnections\" FROM \"Line\" WHERE username LIKE '%snooki%c7weo%';"

echo "=== CLEAR QoE keys (nexlify:conn:q:*) ==="
BEFORE=$(redis-cli --scan --pattern 'nexlify:conn:q:*' 2>/dev/null | wc -l)
echo "keys_before=$BEFORE"
redis-cli --scan --pattern 'nexlify:conn:q:*' 2>/dev/null | while read -r k; do redis-cli del "$k" >/dev/null; done
AFTER=$(redis-cli --scan --pattern 'nexlify:conn:q:*' 2>/dev/null | wc -l)
echo "keys_after=$AFTER"

echo "=== CPU / load ==="
uptime
top -bn1 | head -12
echo "--- PM2 ---"
pm2 list 2>/dev/null | head -12

echo "=== Panel health latency ==="
for path in /api/health /api/admin/playback-qoe; do
  t=$(curl -sS -o /dev/null -w '%{time_total}' --max-time 15 "http://127.0.0.1:13000${path}" 2>/dev/null || echo fail)
  echo "$path ${t}s"
done

echo "=== Nexus line API me_snooki vs sme_snooki ==="
for U in me_snooki_c7weo sme_snooki_c7weo; do
  P=$(sudo -u postgres psql -d nexlify -t -A -c "SELECT password FROM \"Line\" WHERE username='${U}' LIMIT 1;" 2>/dev/null || true)
  if [ -z "$P" ]; then echo "$U: NOT FOUND"; continue; fi
  CODE=$(curl -sS -m 10 -A 'Lavf/58.29.100' -o /tmp/nx.json -w '%{http_code}' "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_categories")
  CATS=$(python3 -c "import json; d=json.load(open('/tmp/nx.json')); print(len(d) if isinstance(d,list) else d.get('user_info',{}).get('message','?'))" 2>/dev/null || echo err)
  echo "$U: http=$CODE categories=$CATS"
done

echo "=== Heavy processes ==="
ps aux --sort=-%cpu | head -12

echo "=== Redis memory ==="
redis-cli info memory 2>/dev/null | grep -E 'used_memory_human|maxmemory'

echo "=== Postgres active connections ==="
sudo -u postgres psql -d nexlify -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='nexlify';"
