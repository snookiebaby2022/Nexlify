#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
sed -i 's/\r$//' /tmp/iptv-edge-proxy.mjs
bash scripts/lock-live-routing-45.sh unlock
cp /tmp/iptv-edge-proxy.mjs scripts/iptv-edge-proxy.mjs
grep -n "16_000_000" scripts/iptv-edge-proxy.mjs | head -3
node scripts/push-edge-to-10gbs.cjs
bash scripts/lock-live-routing-45.sh
pm2 stop nexlify-iptv-edge >/dev/null 2>&1 || true
ss -tlnp | grep ':8080' | head -2
echo "EDGE_PUSH2_OK"
