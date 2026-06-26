#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-panel-update-smoke ==="

cp "$PATCHES/panel-update-auto.ts" "$PANEL/src/lib/panel-update-auto.ts"
cp "$PATCHES/panel-update-smoke-test.ts" "$PANEL/scripts/panel-update-smoke-test.ts"
cp "$PATCHES/cron-jobs.ts" "$PANEL/src/lib/cron-jobs.ts"
cp "$PATCHES/admin-settings-updates-page.tsx" "$PANEL/src/app/admin/settings/updates/page.tsx"

cd "$PANEL"
NODE_ENV=production npm run build
pm2 restart nexlify --update-env

echo "Running panel update smoke test..."
npx tsx scripts/panel-update-smoke-test.ts
