#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-panel-v1.3.0 ==="

# Version bump
node -e "
const fs=require('fs');
const p='$PANEL/package.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.version='1.3.0';
fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
console.log('package.json ->', j.version);
"

# Background updater + sidebar version
cp "$PATCHES/panel-update-job.ts" "$PANEL/src/lib/panel-update-job.ts"
cp "$PATCHES/panel-update.ts" "$PANEL/src/lib/panel-update.ts"
cp "$PATCHES/panel-update-background.ts" "$PANEL/scripts/panel-update-background.ts"
cp "$PATCHES/panel-update-route.ts" "$PANEL/src/app/api/admin/panel-update/route.ts"
cp "$PATCHES/admin-settings-updates-page.tsx" "$PANEL/src/app/admin/settings/updates/page.tsx"
cp "$PATCHES/panel-sidebar.tsx" "$PANEL/src/components/panel-sidebar.tsx"
cp "$PATCHES/panel-sidebar-version.tsx" "$PANEL/src/components/panel-sidebar-version.tsx"
cp "$PATCHES/panel-update-progress.tsx" "$PANEL/src/components/panel-update-progress.tsx"
cp "$PATCHES/panel-shell.tsx" "$PANEL/src/components/panel-shell.tsx"
mkdir -p "$PANEL/src/app/api/panel/version"
cp "$PATCHES/api-panel-version/route.ts" "$PANEL/src/app/api/panel/version/route.ts"

# Anti-Freeze + fast zapping
cp "$PATCHES/anti-freeze.ts" "$PANEL/src/lib/anti-freeze.ts"
cp "$PATCHES/line-playback.ts" "$PANEL/src/lib/line-playback.ts"
cp "$PATCHES/live-playback-route.ts" "$PANEL/src/app/live/[username]/[password]/[streamId]/route.ts"
cp "$PATCHES/player-api-route.ts" "$PANEL/src/app/player_api.php/route.ts"
cp "$PATCHES/admin-settings-streams-page.tsx" "$PANEL/src/app/admin/settings/streams/page.tsx"
cp "$PATCHES/panel-advantages.tsx" "$PANEL/src/components/panel-advantages.tsx"
cp "$PATCHES/panel-settings.ts" "$PANEL/src/lib/panel-settings.ts"
cp "$PATCHES/stream-agent-config.ts" "$PANEL/src/lib/stream-agent-config.ts"
cp "$PATCHES/nginx-agent-snippet.ts" "$PANEL/src/lib/nginx-agent-snippet.ts"

grep -q '.update-progress.json' "$PANEL/.gitignore" 2>/dev/null || echo '.update-progress.json' >> "$PANEL/.gitignore"
rm -f "$PANEL/.update-progress.json"

cd "$PANEL"
npm install --include=dev --no-audit --no-fund
NODE_ENV=production npm run build
pm2 startOrRestart ecosystem.config.cjs --only nexlify --update-env

echo "Panel v1.3.0 applied."
