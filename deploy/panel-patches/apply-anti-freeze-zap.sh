#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-anti-freeze-zap ==="

cp "$PATCHES/anti-freeze.ts" "$PANEL/src/lib/anti-freeze.ts"
cp "$PATCHES/line-playback.ts" "$PANEL/src/lib/line-playback.ts"
cp "$PATCHES/panel-settings.ts" "$PANEL/src/lib/panel-settings.ts"
cp "$PATCHES/stream-agent-config.ts" "$PANEL/src/lib/stream-agent-config.ts"
cp "$PATCHES/nginx-agent-snippet.ts" "$PANEL/src/lib/nginx-agent-snippet.ts"
cp "$PATCHES/live-playback-route.ts" "$PANEL/src/app/live/[username]/[password]/[streamId]/route.ts"
cp "$PATCHES/player-api-route.ts" "$PANEL/src/app/player_api.php/route.ts"
cp "$PATCHES/admin-settings-streams-page.tsx" "$PANEL/src/app/admin/settings/streams/page.tsx"
cp "$PATCHES/panel-advantages.tsx" "$PANEL/src/components/panel-advantages.tsx"

cd "$PANEL"
npm install --include=dev --no-audit --no-fund
NODE_ENV=production npm run build
pm2 startOrRestart ecosystem.config.cjs --only nexlify --update-env

echo "Anti-Freeze + fast zapping applied."
