#!/usr/bin/env bash
# Stabilize panel 45: Redis, 2 workers, cap auto-scale, nginx -> 10gbs edge.
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

echo "=== Redis ==="
if systemctl is-active redis-server >/dev/null 2>&1 || systemctl is-active redis >/dev/null 2>&1; then
  systemctl restart redis-server 2>/dev/null || systemctl restart redis 2>/dev/null || true
  sleep 1
fi
if command -v redis-cli >/dev/null 2>&1; then
  redis-cli ping 2>/dev/null || echo "WARN: redis-cli ping failed"
fi
env_set REDIS_URL "redis://127.0.0.1:6379"

echo "=== Worker cap (XUI-style API panel) ==="
env_set PANEL_INSTANCES "2"
env_set NEXLIFY_STREAMING_OPTIMIZED "1"
env_set NEXLIFY_PANEL_INSTANCES_MAX "2"
env_set NEXLIFY_PANEL_WORKER_SPARE "0"
env_set NEXLIFY_MAX_MEMORY_RESTART "1800M"
env_set NEXLIFY_LIVE_AUTH_CACHE_SEC "180"
node scripts/ensure-db-pool-limit.cjs 2>/dev/null || true

echo "=== Stop local edge on panel (live on 10gbs) ==="
pm2 stop nexlify-iptv-edge 2>/dev/null || true

echo "=== Restart panel with 2 workers ==="
export NEXLIFY_FORCE_RESTART=1
pm2 delete nexlify 2>/dev/null || true
pm2 start ecosystem.config.cjs --only nexlify --update-env
pm2 save >/dev/null 2>&1 || true

echo "=== Cap workers via scale script ==="
bash scripts/scale-panel-workers-live.sh 2>&1 || true

echo "=== nginx live -> remote 10gbs ==="
bash scripts/route-45-live-to-remote-edge.sh 2>&1 | tail -8

echo "=== Flush stale DB connections ==="
node scripts/flush-stale-connections.cjs 2>/dev/null || true
sudo -u postgres psql -d nexlify -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND state='idle' AND state_change < now() - interval '10 minutes' AND pid <> pg_backend_pid();" \
  2>/dev/null || true

echo "=== Wait for health ==="
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -m 5 http://127.0.0.1:13000/api/health >/dev/null; then
    echo "healthy"
    break
  fi
  sleep 3
done
curl -sS -m 12 -o /dev/null -w "health: %{http_code} t=%{time_total}s\n" http://127.0.0.1:13000/api/health || true
curl -sS -m 12 -o /dev/null -w "login: %{http_code} t=%{time_total}s\n" http://127.0.0.1:8080/login || true

echo "=== PM2 ==="
pm2 jlist 2>/dev/null | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).filter(p=>p.name==='nexlify').map(p=>({id:p.pm_id,restarts:p.pm2_env.restart_time,mem:Math.round((p.monit?.memory||0)/1048576)+'mb'}))" || pm2 list | head -12

echo "PERF_FIX_OK"
