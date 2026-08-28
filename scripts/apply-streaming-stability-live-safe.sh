#!/usr/bin/env bash
# Apply all streaming stability fixes WITHOUT restarting panel or edge (live-safe).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
log() { echo "[stability-live] $*"; }

log "kill stray builds"
pkill -9 -f 'next/dist/bin/next build' 2>/dev/null || true
pkill -9 -f rebuild-panel-safe 2>/dev/null || true
rm -rf .next.staging 2>/dev/null || true

systemctl enable redis-server 2>/dev/null || systemctl enable redis 2>/dev/null || true
systemctl start redis-server 2>/dev/null || systemctl start redis 2>/dev/null || true

  if [ -x "$ROOT/scripts/ensure-panel-env.sh" ]; then
    bash "$ROOT/scripts/ensure-panel-env.sh"
  fi

if [ -x "$ROOT/scripts/install-streaming-stability-cron.sh" ]; then
  bash "$ROOT/scripts/install-streaming-stability-cron.sh"
fi

if [ -x "$ROOT/scripts/scale-panel-workers-live.sh" ]; then
  bash "$ROOT/scripts/scale-panel-workers-live.sh"
fi

if [ -x "$ROOT/scripts/prune-stale-live-connections.sh" ]; then
  bash "$ROOT/scripts/prune-stale-live-connections.sh" || true
fi

log "nginx/https sanity (reload only)"
if [ -x "$ROOT/scripts/install-nginx-panel-https.sh" ]; then
  bash "$ROOT/scripts/install-nginx-panel-https.sh" || true
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 save >/dev/null 2>&1 || true
  pm2 list | head -15
fi

log "DONE — no panel/edge restart (streams untouched)"
