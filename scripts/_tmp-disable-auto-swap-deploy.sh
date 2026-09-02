#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
for f in /tmp/source-failover.ts /tmp/resolve-stream-url.ts /tmp/playback-quality-monitor.ts /tmp/live-auth.route.ts /tmp/panel-settings.ts /tmp/panel-settings-probe-defaults.test.ts /tmp/source-swap.page.tsx /tmp/auto-fix.page.tsx /tmp/_tmp-disable-auto-source-swap.cjs; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f"
done
cp /tmp/source-failover.ts src/lib/source-failover.ts
cp /tmp/resolve-stream-url.ts src/lib/resolve-stream-url.ts
cp /tmp/playback-quality-monitor.ts src/lib/playback-quality-monitor.ts
cp /tmp/live-auth.route.ts src/app/api/internal/live-auth/route.ts
cp /tmp/panel-settings.ts src/lib/panel-settings.ts
cp /tmp/panel-settings-probe-defaults.test.ts src/lib/panel-settings-probe-defaults.test.ts
cp /tmp/source-swap.page.tsx src/app/admin/settings/source-swap/page.tsx
cp /tmp/auto-fix.page.tsx src/app/admin/settings/auto-fix/page.tsx

set -a
. ./.env
set +a
NODE_PATH=/opt/nexlify-panel/node_modules node /tmp/_tmp-disable-auto-source-swap.cjs
npx tsx --test src/lib/panel-settings-probe-defaults.test.ts

export NEXLIFY_ALLOW_PROTECTED_45=1
export NEXLIFY_SKIP_GIT_RESET=1
export NEXLIFY_FORCE_BUILD=1
export NEXLIFY_FORCE_RESTART=1
bash scripts/rebuild-panel-safe.sh
pm2 stop nexlify-iptv-edge >/dev/null 2>&1 || true
curl -sS -m 5 -o /dev/null -w 'health:%{http_code}\n' http://127.0.0.1:13000/api/health
echo "AUTO_SWAP_OFF_DONE"
