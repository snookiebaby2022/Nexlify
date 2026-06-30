#!/usr/bin/env bash
# Restore panel after a failed or interrupted update.
# 1) Restart if .next is valid
# 2) Roll back from .next.backup
# 3) Full rebuild (unless --quick)
#
# Usage: bash scripts/panel-update-recover.sh [--quick]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
QUICK="${1:-}"

has_valid_next() {
  bash "$ROOT/scripts/has-valid-next-build.sh" 2>/dev/null
}

restore_backup() {
  if [ ! -d .next.backup ]; then
    return 1
  fi
  if ! bash -c '[ -f .next.backup/BUILD_ID ] || [ -f .next.backup/standalone/server.js ]' 2>/dev/null; then
    return 1
  fi
  echo "Recover: rolling back to .next.backup"
  rm -rf .next
  mv .next.backup .next
  return 0
}

clear_stale_update_job() {
  if [ ! -f .update-progress.json ]; then
    return 0
  fi
  node -e "
    const fs = require('fs');
    const p = '.update-progress.json';
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j.status !== 'running') process.exit(0);
      j.status = 'failed';
      j.currentStep = null;
      j.finishedAt = new Date().toISOString();
      j.message = 'Update interrupted — panel recovered from backup or rebuild.';
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
    } catch {
      fs.unlinkSync(p);
    }
  " 2>/dev/null || rm -f .update-progress.json .update-progress.pid
}

restart_panel() {
  sed -i 's/\r$//' "$ROOT"/scripts/*.sh 2>/dev/null || true
  if [ -x "$ROOT/scripts/panel-restart-safe.sh" ]; then
    bash "$ROOT/scripts/panel-restart-safe.sh" --nexlify-only
  elif [ -x "$ROOT/scripts/pm2-start.sh" ]; then
    bash "$ROOT/scripts/pm2-start.sh"
  else
    pm2 restart nexlify --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --only nexlify --update-env
    pm2 save 2>/dev/null || true
  fi
}

echo "=== panel-update-recover ($QUICK) ==="

if has_valid_next; then
  echo "Recover: production build present"
  restart_panel
  clear_stale_update_job
  exit 0
fi

if restore_backup; then
  restart_panel
  clear_stale_update_job
  echo "Recover: OK (restored backup)"
  exit 0
fi

if [ "$QUICK" = "--quick" ]; then
  echo "Recover: no valid build and no backup (--quick)" >&2
  exit 1
fi

echo "Recover: rebuilding panel (no backup available) ..."
pm2 stop nexlify 2>/dev/null || true
pm2 delete nexlify 2>/dev/null || true
export NEXT_PRIVATE_WORKER_THREADS=false
npm run build
bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
restart_panel
clear_stale_update_job
echo "Recover: OK (rebuilt)"
