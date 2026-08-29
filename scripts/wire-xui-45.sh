#!/bin/bash
# XUI-style wiring for server 45:
#   Panel (13000) = admin + Xtream API + live-auth
#   10gbs = IPTV edge (upstream egress IP) + stream agent
#   nginx :8080 on panel = API local, /live/ → 10gbs edge
set -euo pipefail
cd /opt/nexlify-panel

PANEL_IP="${PANEL_IP:-45.88.138.18}"
REMOTE_EDGE="${REMOTE_EDGE:-209.237.141.15:8080}"

echo "=== 1/8 Postgres + lean panel workers ==="
sudo -u postgres psql -d nexlify -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND pid <> pg_backend_pid() AND state IN ('idle','idle in transaction');" 2>/dev/null | tail -3 || true
grep -q '^PANEL_INSTANCES=' .env && sed -i 's/^PANEL_INSTANCES=.*/PANEL_INSTANCES=2/' .env || echo 'PANEL_INSTANCES=2' >> .env
grep -q '^NEXLIFY_STREAMING_OPTIMIZED=' .env && sed -i 's/^NEXLIFY_STREAMING_OPTIMIZED=.*/NEXLIFY_STREAMING_OPTIMIZED=1/' .env || echo 'NEXLIFY_STREAMING_OPTIMIZED=1' >> .env
export NEXLIFY_FORCE_RESTART=1
pm2 delete nexlify 2>/dev/null || true
pm2 start ecosystem.config.cjs --only nexlify --update-env
sleep 10
curl -s -m 10 http://127.0.0.1:13000/api/health; echo

echo "=== 2/8 Agent token for 10gbs LB auth ==="
node scripts/ensure-10gbs-agent-token.cjs

echo "=== 3/8 Assign unassigned live streams to 10gbs ==="
node scripts/assign-live-to-10gbs.cjs

echo "=== 4/8 Egress proxy row (optional tinyproxy on 10gbs) ==="
node scripts/link-10gbs-proxy.cjs 2>/dev/null || true

echo "=== 5/8 Deploy IPTV edge + agent on 10gbs ==="
node scripts/deploy-10gbs-edge-from-panel.cjs

echo "=== 6/8 nginx on panel: Xtream API local, /live/ → 10gbs ==="
bash scripts/open-stream-node-auth-port.sh
export NEXLIFY_FORCE_RESTART=1
pm2 delete nexlify 2>/dev/null || true
pm2 start ecosystem.config.cjs --only nexlify --update-env
sleep 12
REMOTE_EDGE="$REMOTE_EDGE" bash scripts/route-45-live-to-remote-edge.sh

echo "=== 7/8 Flush caches ==="
node scripts/invalidate-playback-cache.cjs 2>/dev/null || true
node scripts/flush-stale-connections.cjs 2>/dev/null || true

echo "=== 8/8 Verify playback ==="
sleep 5
bash scripts/quick-playback-check-45.sh

echo WIRE_XUI_OK
