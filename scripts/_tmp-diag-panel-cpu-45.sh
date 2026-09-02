#!/bin/bash
echo "=== Slow PG queries ==="
sudo -u postgres psql -d nexlify -c "SELECT pid, now()-query_start AS dur, left(query,120) AS q FROM pg_stat_activity WHERE datname='nexlify' AND state='active' AND query NOT LIKE '%pg_stat%' ORDER BY query_start LIMIT 10;"

echo "=== nexlify-license logs ==="
pm2 logs nexlify-license --lines 8 --nostream 2>/dev/null | tail -12

echo "=== cron-daemon what doing ==="
pm2 logs nexlify-cron --lines 6 --nostream 2>/dev/null | tail -10

echo "=== PANEL_INSTANCES ==="
grep PANEL_INSTANCES /opt/nexlify-panel/.env 2>/dev/null || echo default

echo "=== Time admin pages (no auth - expect 403 fast) ==="
curl -sS -m 20 -o /dev/null -w "connections_api:%{http_code} t=%{time_total}\n" http://127.0.0.1:13000/api/admin/connections
curl -sS -m 20 -o /dev/null -w "dashboard_stream:%{http_code} t=%{time_total}\n" http://127.0.0.1:13000/api/admin/dashboard-stream

echo "=== listLiveConnections count ==="
sudo -u postgres psql -d nexlify -t -c "SELECT count(*) FROM \"LiveConnection\" WHERE \"lastSeenAt\" > now()-interval '3 minutes';"

echo "=== IO wait / disk ==="
iostat -x 1 2 2>/dev/null | tail -8 || echo no iostat
