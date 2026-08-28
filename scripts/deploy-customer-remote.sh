#!/usr/bin/env bash
# Remote rebuild after WinSCP sync (called from windows/scripts/deploy-customer-from-windows.ps1).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE_BUILD="${NEXLIFY_FORCE_BUILD:-0}"

log() { echo "[deploy-customer] $*"; }

free_postgres_slots() {
  if [ ! -f .env ]; then return 0; fi
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'idle' AND wait_event_type = 'Client';" \
      >/dev/null 2>&1 || true
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -u postgres psql -d nexlify -v ON_ERROR_STOP=0 -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'nexlify' AND pid <> pg_backend_pid() AND state = 'idle';" \
      >/dev/null 2>&1 || true
  fi
}

run_migrate_deploy() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if npx prisma migrate deploy 2>&1; then
      return 0
    fi
    log "migrate deploy attempt $attempt failed (postgres busy?) — freeing slots and retrying..."
    bash scripts/prune-stale-live-connections.sh 2>/dev/null || true
    node scripts/flush-live-connections.cjs 2>/dev/null || true
    free_postgres_slots
    sleep "$attempt"
  done
  return 1
}

rm -f .update-progress.json .update-progress.pid
sed -i 's/\r$//' scripts/*.sh scripts/*.mjs ecosystem.config.cjs 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

log "prune connections before DB work"
bash scripts/prune-stale-live-connections.sh 2>/dev/null || true
node scripts/flush-live-connections.cjs 2>/dev/null || true
free_postgres_slots

log "prisma generate"
npx prisma generate

log "prisma migrate deploy"
if ! run_migrate_deploy; then
  log "migrate deploy failed — checking if schema is already current..."
  if bash scripts/verify-db-schema.sh 2>/dev/null; then
    log "schema verified OK — continuing without migrate deploy"
  else
    log "FATAL: postgres connection slots exhausted and schema not verified" >&2
    log "Try: ssh in, stop load test, run: bash scripts/prune-stale-live-connections.sh && node scripts/flush-live-connections.cjs" >&2
    exit 1
  fi
else
  bash scripts/verify-db-schema.sh 2>/dev/null || node scripts/audit-db-schema.cjs
fi

export NEXLIFY_FORCE_BUILD="$FORCE_BUILD"
log "npm run build (NEXLIFY_FORCE_BUILD=$FORCE_BUILD)"
npm run build

log "restart panel + edge"
bash scripts/panel-restart-safe.sh --nexlify-only
bash scripts/install-iptv-edge-proxy.sh 2>/dev/null || pm2 restart nexlify-iptv-edge 2>/dev/null || true

echo DEPLOY_OK
