#!/usr/bin/env bash
# Tune panel + nginx for high concurrent IPTV viewers (run on the stream/panel host).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[tune] Panel streaming load profile"

# Fewer PM2 workers = larger Postgres pool per worker (avoids connection starvation).
if [ -f .env ] && ! grep -q '^PANEL_INSTANCES=' .env 2>/dev/null; then
  echo "PANEL_INSTANCES=2" >> .env
  echo "[tune] Set PANEL_INSTANCES=2 in .env"
fi

if [ -f scripts/install-nginx-stream-edge.sh ]; then
  bash scripts/install-nginx-stream-edge.sh || true
fi

if [ -f scripts/prune-stale-live-connections.sh ]; then
  bash scripts/prune-stale-live-connections.sh || true
fi

echo "[tune] Rebuild panel after src/ changes"
npm run build
bash scripts/panel-restart-safe.sh --nexlify-only

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart nexlify-iptv-edge 2>/dev/null || bash scripts/install-iptv-edge-proxy.sh 2>/dev/null || true
fi

echo "[tune] Done."
