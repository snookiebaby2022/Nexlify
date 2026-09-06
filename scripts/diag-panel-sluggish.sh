#!/bin/bash
# Read-only panel sluggishness diagnostics
set -euo pipefail
echo "=== $(date -u) PANEL SLUGGISH DIAG ==="
echo ""
echo "=== LOAD / CPU / MEM / DISK ==="
uptime
echo "---"
free -h
echo "---"
df -h / /var /tmp 2>/dev/null | head -10
echo "---"
nproc
echo "--- top CPU ---"
ps aux --sort=-%cpu | head -15
echo "--- top MEM ---"
ps aux --sort=-%mem | head -12

echo ""
echo "=== PM2 ==="
pm2 jlist 2>/dev/null | node -e '
let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{
  const arr=JSON.parse(d||"[]");
  for (const a of arr) {
    const m=a.monit||{};
    console.log(JSON.stringify({
      name:a.name, status:a.pm2_env?.status, restarts:a.pm2_env?.restart_time,
      cpu:m.cpu, memMb: Math.round((m.memory||0)/1024/1024),
      uptimeSec: a.pm2_env?.pm_uptime ? Math.round((Date.now()-a.pm2_env.pm_uptime)/1000) : null
    }));
  }
});
'
echo "--- event loop / health ---"
curl -sS -m 5 -w "health_ttfb=%{time_starttransfer}s total=%{time_total}s code=%{http_code}\n" \
  -o /tmp/h.json http://127.0.0.1:13000/api/health || true
cat /tmp/h.json 2>/dev/null; echo
curl -sS -m 8 -w "dash_api_ttfb=%{time_starttransfer}s total=%{time_total}s code=%{http_code}\n" \
  -o /dev/null http://127.0.0.1:13000/api/admin/dashboard-stats 2>/dev/null || \
curl -sS -m 8 -w "admin_ttfb=%{time_starttransfer}s total=%{time_total}s code=%{http_code}\n" \
  -o /dev/null http://127.0.0.1:13000/admin 2>/dev/null || true

echo ""
echo "=== REDIS ==="
redis-cli INFO memory 2>/dev/null | grep -E 'used_memory_human|maxmemory_human|mem_fragmentation' || true
redis-cli INFO clients 2>/dev/null | grep -E 'connected_clients|blocked_clients' || true
redis-cli DBSIZE 2>/dev/null || true

echo ""
echo "=== POSTGRES ==="
sudo -u postgres psql -d nexlify -c "SELECT count(*) AS active FROM pg_stat_activity WHERE state='active';" 2>/dev/null || \
  psql -d nexlify -c "SELECT count(*) AS active FROM pg_stat_activity WHERE state='active';" 2>/dev/null || true
sudo -u postgres psql -d nexlify -c "
SELECT pid, now()-query_start AS age, state, left(query,120) AS q
FROM pg_stat_activity
WHERE datname=current_database() AND state <> 'idle'
ORDER BY query_start NULLS LAST
LIMIT 15;
" 2>/dev/null || true
sudo -u postgres psql -d nexlify -c "
SELECT relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC NULLS LAST
LIMIT 10;
" 2>/dev/null || true
sudo -u postgres psql -d nexlify -c "
SELECT count(*) AS live_connections FROM \"LiveConnection\";
SELECT count(*) AS streams FROM \"Stream\";
SELECT count(*) AS lines FROM \"Line\";
" 2>/dev/null || true

echo ""
echo "=== NIC (panel eth0) ==="
python3 - <<'PY'
import time
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith('eth0:'):
      c=line.replace(':',' ').split(); return int(c[1]),int(c[9])
  return 0,0
a=n(); time.sleep(2); b=n()
print(f"panel RX={(b[0]-a[0])*8/2/1e9:.3f} TX={(b[1]-a[1])*8/2/1e9:.3f} Gbps")
PY

echo ""
echo "=== NGINX / OPEN FDS ==="
ss -s 2>/dev/null | head -8 || true
echo "nexlify fds:" $(ls /proc/$(pgrep -f 'node.*standalone' | head -1)/fd 2>/dev/null | wc -l)
echo "nginx workers:" $(pgrep -c nginx || true)

echo ""
echo "=== DASHBOARD-RELATED ENDPOINTS (timing, may 401) ==="
for path in /api/admin/dashboard-stats /api/admin/dashboard-stream /api/health /player_api.php; do
  curl -sS -m 6 -o /dev/null -w "$path ttfb=%{time_starttransfer}s total=%{time_total}s code=%{http_code}\n" \
    "http://127.0.0.1:13000${path}" || echo "$path fail"
done

echo ""
echo "=== RECENT ERRORS (pm2 err tail) ==="
pm2 logs nexlify --err --lines 30 --nostream 2>/dev/null | tail -40 || true

echo "DONE"
