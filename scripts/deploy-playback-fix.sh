#!/usr/bin/env bash
# Deploy playback fixes on server 45: pull/build/restart + smoke test.
set -euo pipefail
cd /opt/nexlify-panel

echo "=== git pull ==="
git fetch origin main
git reset --hard origin/main

echo "=== rebuild panel ==="
bash scripts/rebuild-panel-safe.sh

echo "=== restart edge + hls ==="
pm2 restart nexlify-iptv-edge nexlify-hls

echo "=== wait for health ==="
sleep 5
curl -sf "http://127.0.0.1:13000/api/health" >/dev/null && echo "panel OK" || echo "panel health WARN"

echo "=== apply panel optimizations ==="
bash scripts/server-apply-panel-optimizations.sh

echo "=== smoke test ==="
bash scripts/playback-smoke-hls-vlc.sh
