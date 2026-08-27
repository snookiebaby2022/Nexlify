#!/usr/bin/env bash
# One-shot IPTV production stack: env, tuning, cron, nginx, edge, verify.
#
#   PHASE=safe  — no panel rebuild (default, live-traffic safe)
#   PHASE=full  — rebuild panel + edge (use FORCE=1 off-peak)
#   PHASE=env   — env + tune + cron only
#
# Examples:
#   bash scripts/apply-iptv-production-stack.sh
#   PHASE=full FORCE=1 bash scripts/apply-iptv-production-stack.sh
#   VERIFY_USER=lucky15 VERIFY_PASS=secret bash scripts/apply-iptv-production-stack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHASE="${PHASE:-safe}"
log() { echo "[iptv-production] $*"; }

run() {
  if [ -x "$1" ]; then
    log "→ $1"
    bash "$1"
  else
    log "skip missing $1"
  fi
}

log "phase=$PHASE root=$ROOT"

run "$ROOT/scripts/ensure-panel-env.sh"
run "$ROOT/scripts/tune-streaming-host.sh"
run "$ROOT/scripts/install-streaming-stability-cron.sh"

case "$PHASE" in
  env)
    log "env-only phase complete"
    ;;
  full)
    if [ "${FORCE:-0}" = "1" ]; then
      export FORCE=1 NEXLIFY_FORCE_BUILD=1
    fi
    run "$ROOT/scripts/apply-streaming-full-deploy.sh"
    ;;
  safe|*)
    run "$ROOT/scripts/apply-streaming-safeguards.sh"
    run "$ROOT/scripts/install-nginx-stream-edge.sh"
    if [ "${SKIP_EDGE:-0}" != "1" ]; then
      run "$ROOT/scripts/install-iptv-edge-proxy.sh"
    fi
    ;;
esac

if [ "${SKIP_VERIFY:-0}" != "1" ] && [ -x "$ROOT/scripts/verify-iptv-playback.sh" ]; then
  U="${VERIFY_USER:-lucky15}"
  P="${VERIFY_PASS:-chedpie30}"
  BASE="${VERIFY_BASE:-http://127.0.0.1:8080}"
  log "playback verify user=$U base=$BASE"
  bash "$ROOT/scripts/verify-iptv-playback.sh" "$U" "$P" "$BASE" || log "WARN: playback probe failed (see above)"
fi

log "DONE phase=$PHASE"
log "Docs: docs/IPTV-SCALE.md"
