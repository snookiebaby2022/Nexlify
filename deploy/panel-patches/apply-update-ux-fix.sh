#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-update-ux-fix ==="

cp "$PATCHES/panel-update-route.ts" "$PANEL/src/app/api/admin/panel-update/route.ts"
cp "$PATCHES/admin-settings-updates-page.tsx" "$PANEL/src/app/admin/settings/updates/page.tsx"
cp "$PATCHES/panel-settings.ts" "$PANEL/src/lib/panel-settings.ts"
cp "$PATCHES/panel-update-banner.tsx" "$PANEL/src/components/panel-update-banner.tsx"

cd "$PANEL"
NODE_ENV=production npm run build
pm2 restart nexlify --update-env

echo "Update UX fix applied."
