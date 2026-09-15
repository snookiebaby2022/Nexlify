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
  # Always wipe progress so Updates UI cannot stay stuck at 88% / failed.
  rm -f .update-progress.json .update-progress.pid .update-in-progress
  pkill -f panel-update-background 2>/dev/null || true
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

panel_healthy() {
  local code
  code="$(curl -sS -o /tmp/nexlify-recover-health.json -w '%{http_code}' -m 8 http://127.0.0.1:13000/api/health 2>/dev/null || echo 000)"
  if [ "$code" = "200" ] && grep -q '"app":"ok"' /tmp/nexlify-recover-health.json 2>/dev/null; then
    rm -f /tmp/nexlify-recover-health.json
    return 0
  fi
  rm -f /tmp/nexlify-recover-health.json
  return 1
}

snapshot_backup() {
  if [ -x "$ROOT/scripts/snapshot-next-backup.sh" ]; then
    bash "$ROOT/scripts/snapshot-next-backup.sh" || true
  fi
}

restore_vendor_prebuilt() {
  local ver url
  ver="$(node -p 'require("./package.json").version' 2>/dev/null || true)"
  [ -n "$ver" ] || return 1
  url="${PANEL_PREBUILT_URL:-https://nexlify.live/downloads/next-${ver}.tar.gz}"
  export PANEL_VENDOR_IP="${PANEL_VENDOR_IP:-85.17.162.54}"
  if [ ! -x "$ROOT/scripts/apply-prebuilt-update.sh" ]; then
    return 1
  fi
  echo "Recover: applying vendor prebuilt $url"
  bash "$ROOT/scripts/apply-prebuilt-update.sh" "$url" download
  bash "$ROOT/scripts/apply-prebuilt-update.sh" "$url" extract
  bash "$ROOT/scripts/apply-prebuilt-update.sh" "$url" apply
}

# Never tear down a serving panel to "fix" a missing standalone file.
if panel_healthy; then
  echo "Recover: panel already healthy — leaving it alone"
  snapshot_backup
  clear_stale_update_job
  exit 0
fi

if [ -f "$ROOT/scripts/ensure-prisma-client.sh" ]; then
  bash "$ROOT/scripts/ensure-prisma-client.sh" || echo "WARN: prisma client repair failed"
fi

if has_valid_next; then
  echo "Recover: production build present"
  restart_panel
  snapshot_backup
  clear_stale_update_job
  exit 0
fi

if restore_backup; then
  restart_panel
  snapshot_backup
  clear_stale_update_job
  echo "Recover: OK (restored backup)"
  exit 0
fi

if restore_vendor_prebuilt; then
  snapshot_backup
  clear_stale_update_job
  echo "Recover: OK (vendor prebuilt)"
  exit 0
fi

if [ "$QUICK" = "--quick" ]; then
  echo "Recover: no valid build, backup, or prebuilt (--quick)" >&2
  exit 1
fi

echo "Recover: rebuilding panel (last resort — no backup/prebuilt) ..."
# Do not stop nexlify first — a failed build must not take a working (or
# restartable) process offline. Use the installed Next binary, never npx.
if [ -x "$ROOT/scripts/ensure-customer-ip-env.sh" ]; then
  bash "$ROOT/scripts/ensure-customer-ip-env.sh" || true
fi
export NEXT_PRIVATE_WORKER_THREADS=false
export NEXLIFY_SKIP_GIT_RESET="${NEXLIFY_SKIP_GIT_RESET:-1}"
if [ ! -x "$ROOT/node_modules/.bin/next" ]; then
  echo "Recover: next binary missing — cannot rebuild safely" >&2
  exit 1
fi
if ! "$ROOT/node_modules/.bin/next" build; then
  echo "Recover: rebuild failed — not stopping panel" >&2
  exit 1
fi
bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
bash "$ROOT/scripts/verify-standalone.sh" 2>/dev/null || true
restart_panel
clear_stale_update_job
echo "Recover: OK (rebuilt)"
