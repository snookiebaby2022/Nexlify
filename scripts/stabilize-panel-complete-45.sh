#!/usr/bin/env bash
# Complete panel stabilization for server 45 — DB pool, workers, ports, nginx, playback.
set -euo pipefail
cd /opt/nexlify-panel

env_set() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

echo "=== 1. Lock streaming profile (2 API workers max) ==="
env_set PANEL_INSTANCES "2"
env_set NEXLIFY_STREAMING_OPTIMIZED "1"
env_set NEXLIFY_PANEL_INSTANCES_MAX "2"
env_set NEXLIFY_PANEL_WORKER_SPARE "0"
env_set NEXLIFY_MAX_MEMORY_RESTART "1800M"
env_set NEXLIFY_LIVE_AUTH_CACHE_SEC "180"
env_set NEXLIFY_WORKER_WEDGE_RSS_MB "1600"
env_set REDIS_URL "redis://127.0.0.1:6379"

echo "=== 2. Prisma connection pool (prevents P2037) ==="
node scripts/ensure-db-pool-limit.cjs 2>/dev/null || true

echo "=== 3. Redis ==="
systemctl restart redis-server 2>/dev/null || systemctl restart redis 2>/dev/null || true
sleep 1
redis-cli ping 2>/dev/null || echo "WARN redis ping failed"

echo "=== 4. PostgreSQL — kill wedged queries + idle connections ==="
sudo -u postgres psql -d nexlify -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND pid <> pg_backend_pid() AND state = 'idle in transaction' AND state_change < now() - interval '2 minutes';" \
  2>/dev/null || true
sudo -u postgres psql -d nexlify -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND pid <> pg_backend_pid() AND state <> 'idle' AND query_start < now() - interval '3 minutes';" \
  2>/dev/null || true
sudo -u postgres psql -d nexlify -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND state='idle' AND state_change < now() - interval '10 minutes' AND pid <> pg_backend_pid();" \
  2>/dev/null || true

echo "=== 5. Port audit — nginx owns :8080, panel on :13000 only ==="
pm2 stop nexlify-iptv-edge 2>/dev/null || true
# Never fuser -k :8080 (kills nginx). Only stop Node edge stealing the port.
for pid in $(ss -tlnp 2>/dev/null | grep ':8080' | grep -oP 'pid=\K[0-9]+' | sort -u); do
  comm=$(ps -p "$pid" -o comm= 2>/dev/null || true)
  if [ "$comm" = "node" ] || [ "$comm" = "MainThread" ]; then
    echo "Killing node on :8080 pid=$pid"
    kill -9 "$pid" 2>/dev/null || true
  fi
done

echo "=== 6. Flush stale live connection rows ==="
node scripts/flush-stale-connections.cjs 2>/dev/null || true
node scripts/flush-live-connections.cjs 2>/dev/null || true

echo "=== 7. Restart panel — 2 workers, fresh pool ==="
export NEXLIFY_FORCE_RESTART=1
pm2 delete nexlify 2>/dev/null || true
pm2 start ecosystem.config.cjs --only nexlify --update-env
pm2 save >/dev/null 2>&1 || true
bash scripts/scale-panel-workers-live.sh 2>&1 || true

echo "=== 8. nginx routing (locked proxy /live/ → 10gbs) ==="
bash scripts/lock-live-routing-45.sh 2>&1 | tail -12

echo "=== 9. Wait for health ==="
for i in $(seq 1 15); do
  if curl -sf -m 4 http://127.0.0.1:13000/api/health >/dev/null 2>&1; then
    echo "healthy after ${i} attempts"
    break
  fi
  sleep 2
done

echo "=== 10. Timings ==="
curl -sS -m 8 -o /dev/null -w "health13000: %{http_code} t=%{time_total}s\n" http://127.0.0.1:13000/api/health || true
curl -sS -m 8 -o /dev/null -w "login8080: %{http_code} t=%{time_total}s\n" http://127.0.0.1:8080/login || true
curl -sS -m 8 -o /dev/null -w "player8080: %{http_code} t=%{time_total}s\n" "http://127.0.0.1:8080/player_api.php" || true

echo "=== 11. PM2 + ports ==="
pm2 jlist 2>/dev/null | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).filter(p=>p.name==='nexlify').map(p=>({id:p.pm_id,mem:Math.round((p.monit?.memory||0)/1048576)+'mb',restarts:p.pm2_env.restart_time}))" || true
ss -tlnp 2>/dev/null | grep -E ':8080 |:13000 ' | head -4

echo "=== 12. Auth path ==="
node scripts/test-auth-10gbs-to-panel.cjs 2>&1 | tail -3 || true

echo "STABILIZE_PANEL_OK"
