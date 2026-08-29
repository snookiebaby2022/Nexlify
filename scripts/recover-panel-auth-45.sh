#!/usr/bin/env bash
# Recover panel API/live-auth capacity without touching the remote stream edge.
set -euo pipefail
cd /opt/nexlify-panel

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

# This host has 32 CPUs / 125 GiB. Four API workers absorb auth bursts while
# the per-worker Prisma cap keeps PostgreSQL below its connection ceiling.
set_env PANEL_INSTANCES 4
set_env NEXLIFY_PANEL_INSTANCES_MAX 4
set_env NEXLIFY_PANEL_WORKER_SPARE 0
set_env NEXLIFY_STREAMING_OPTIMIZED 1
set_env NEXLIFY_MAX_MEMORY_RESTART 3072M
set_env NEXLIFY_WORKER_WEDGE_RSS_MB 2600
set_env NEXLIFY_LIVE_AUTH_CACHE_SEC 300
set_env REDIS_URL redis://127.0.0.1:6379

node scripts/ensure-db-pool-limit.cjs
redis-cli ping

# Cancel only genuinely stuck work. Do not delete legitimate viewer sessions.
sudo -u postgres psql -d nexlify -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'nexlify'
  AND pid <> pg_backend_pid()
  AND (
    (state = 'idle in transaction' AND state_change < now() - interval '60 seconds')
    OR
    (state <> 'idle' AND query_start < now() - interval '5 minutes')
  );
SQL

pm2 delete nexlify 2>/dev/null || true
pm2 start ecosystem.config.cjs --only nexlify --update-env
pm2 save >/dev/null

for i in $(seq 1 30); do
  if curl -sf -m 3 http://127.0.0.1:13000/api/health >/dev/null; then
    echo "panel healthy after ${i} attempt(s)"
    break
  fi
  sleep 2
done

curl -sS -m 5 -o /dev/null \
  -w 'panel health=%{http_code} total=%{time_total}s\n' \
  http://127.0.0.1:13000/api/health
pm2 jlist | node -e '
const p = JSON.parse(require("fs").readFileSync(0, "utf8"));
console.log(p.filter(x => x.name === "nexlify").map(x => ({
  id: x.pm_id,
  status: x.pm2_env.status,
  rssMb: Math.round((x.monit.memory || 0) / 1048576),
  cpu: x.monit.cpu
})));
'
