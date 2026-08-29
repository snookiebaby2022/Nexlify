#!/usr/bin/env bash
# Stop duplicate purge (resume later), stabilize panel for playback.
set -euo pipefail
cd /opt/nexlify-panel

echo "=== Stop duplicate purge (resume later) ==="
pkill -f 'purge-live-url-duplicates' 2>/dev/null || true
sleep 2

echo "=== Panel: 2 workers ==="
grep -q '^PANEL_INSTANCES=' .env && sed -i 's/^PANEL_INSTANCES=.*/PANEL_INSTANCES=2/' .env || echo 'PANEL_INSTANCES=2' >> .env
export NEXLIFY_FORCE_RESTART=1
pm2 delete nexlify 2>/dev/null || true
pm2 start ecosystem.config.cjs --only nexlify --update-env
pm2 stop nexlify-iptv-edge 2>/dev/null || true

echo "=== nginx live -> 10gbs ==="
bash scripts/route-45-live-to-remote-edge.sh 2>&1 | tail -5

echo "=== Wait for panel ==="
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -m 5 http://127.0.0.1:13000/api/health >/dev/null; then echo healthy; break; fi
  sleep 3
done
curl -sS -m 10 http://127.0.0.1:13000/api/health || true
echo

echo "=== Playback verify ==="
node scripts/flush-stale-connections.cjs 2>/dev/null || true
bash scripts/verify-iptv-playback.sh 2>&1 | tail -20
