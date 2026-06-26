#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-panel-bg-update-fix ==="

cp "$PATCHES/panel-update-job.ts" "$PANEL/src/lib/panel-update-job.ts"
cp "$PATCHES/panel-update.ts" "$PANEL/src/lib/panel-update.ts"
cp "$PATCHES/panel-update-background.ts" "$PANEL/scripts/panel-update-background.ts"
cp "$PATCHES/panel-update-route.ts" "$PANEL/src/app/api/admin/panel-update/route.ts"
cp "$PATCHES/admin-settings-updates-page.tsx" "$PANEL/src/app/admin/settings/updates/page.tsx"

grep -q '.update-progress.json' "$PANEL/.gitignore" 2>/dev/null || echo '.update-progress.json' >> "$PANEL/.gitignore"

cd "$PANEL"
npm install --include=dev --no-audit --no-fund
NODE_ENV=production npm run build
pm2 startOrRestart ecosystem.config.cjs --only nexlify --update-env

echo "Background panel update fix applied."
