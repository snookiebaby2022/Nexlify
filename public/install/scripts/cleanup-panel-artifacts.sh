#!/usr/bin/env bash
# Remove stale build/update artifacts and legacy files that should not ship on a panel VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[cleanup] $*"; }

removed=0
rm_path() {
  local p="$1"
  if [ -e "$p" ] || [ -d "$p" ]; then
    rm -rf "$p"
    log "removed $p"
    removed=$((removed + 1))
  fi
}

# Staging / backup builds from failed or partial updates
rm_path "$ROOT/.next.old"
rm_path "$ROOT/.next.staging"
rm_path "$ROOT/.next.backup"

# Update job state (safe to clear when idle)
rm_path "$ROOT/.update-progress.json"
rm_path "$ROOT/.update-progress.pid"
rm_path "$ROOT/.update-in-progress"

# Legacy in-process cron (replaced by nexlify-cron PM2 app)
rm_path "$ROOT/src/instrumentation.ts"
rm_path "$ROOT/src/lib/cron-scheduler.ts"

# Marketing-only trees (never part of production panel)
rm_path "$ROOT/marketing-drop-in"
rm_path "$ROOT/promo-for-nexlify-web"

# Optional: drop old PM2 error logs (keeps current process logs)
if [ "${CLEANUP_PM2_LOGS:-0}" = "1" ] && command -v pm2 >/dev/null 2>&1; then
  pm2 flush nexlify 2>/dev/null || true
  log "flushed nexlify PM2 logs"
fi

log "done ($removed artifact group(s) removed)"
