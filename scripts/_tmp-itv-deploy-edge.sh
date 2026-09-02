#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
for f in /tmp/iptv-edge-proxy.mjs /tmp/connection-quality-live.ts /tmp/connection-quality.ts /tmp/connection-pulse.ts /tmp/connection-pulse-batch.ts /tmp/connection-pulse-batch.route.ts /tmp/connection-quality-live.test.ts /tmp/_tmp-hide-uk-ent-ondemand-dupes.cjs; do
  sed -i 's/\r$//' "$f"
done

cp /tmp/connection-quality-live.ts src/lib/connection-quality-live.ts
cp /tmp/connection-quality.ts src/lib/connection-quality.ts
cp /tmp/connection-pulse.ts src/lib/connection-pulse.ts
cp /tmp/connection-pulse-batch.ts src/lib/connection-pulse-batch.ts
cp /tmp/connection-pulse-batch.route.ts src/app/api/internal/connection-pulse-batch/route.ts
cp /tmp/connection-quality-live.test.ts src/lib/connection-quality-live.test.ts

echo "=== tests ==="
npx tsx --test src/lib/connection-quality-live.test.ts src/lib/connection-quality.test.ts

echo "=== hide dry-run ==="
NODE_PATH=/opt/nexlify-panel/node_modules node /tmp/_tmp-hide-uk-ent-ondemand-dupes.cjs

echo "=== unlock + install edge ==="
bash scripts/lock-live-routing-45.sh unlock
cp /tmp/iptv-edge-proxy.mjs scripts/iptv-edge-proxy.mjs
grep -n "Never pause the origin" scripts/iptv-edge-proxy.mjs | head -3
node scripts/push-edge-to-10gbs.cjs
bash scripts/lock-live-routing-45.sh
pm2 stop nexlify-iptv-edge >/dev/null 2>&1 || true
ss -tlnp | grep -E ':8080|:80 ' | head -10
echo "EDGE_PUSH_DONE"
