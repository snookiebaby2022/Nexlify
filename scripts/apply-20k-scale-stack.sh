#!/usr/bin/env bash
# 20k scale stack: kernel, Redis, PgBouncer (optional), cron, env merge, readiness check.
#
#   DB_PASS=secret bash scripts/apply-20k-scale-stack.sh
#   VERIFY_USER=demo VERIFY_PASS=demo123 bash scripts/apply-20k-scale-stack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
log() { echo "[20k-stack] $*"; }

run() {
  if [ -x "$1" ]; then
    log "→ $1"
    bash "$1" || log "WARN: $1 returned non-zero"
  fi
}

# Merge recommended env keys if example exists
if [ -f "$ROOT/scripts/iptv-20k.env.example" ]; then
  log "Review scripts/iptv-20k.env.example and merge into .env"
fi

run "$ROOT/scripts/ensure-panel-env.sh"
run "$ROOT/scripts/tune-kernel-20k.sh"
run "$ROOT/scripts/tune-streaming-host.sh"
run "$ROOT/scripts/install-redis-production.sh"
run "$ROOT/scripts/install-streaming-stability-cron.sh"

if [ -n "${DB_PASS:-}" ]; then
  DB_USER="${DB_USER:-nexlify}" DB_NAME="${DB_NAME:-nexlify}" DB_PASS="$DB_PASS" \
    run "$ROOT/scripts/install-pgbouncer.sh"
fi

if [ -n "${EDGE_IPS:-}" ]; then
  run "$ROOT/scripts/apply-multi-edge-stack.sh"
fi

run "$ROOT/scripts/apply-iptv-production-stack.sh"

VERIFY_USER="${VERIFY_USER:-}" VERIFY_PASS="${VERIFY_PASS:-}" \
  bash "$ROOT/scripts/verify-20k-readiness.sh" || log "WARN: 20k readiness incomplete"

log "DONE — docs/IPTV-SCALE.md Phase 3"
