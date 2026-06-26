#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-panel-updates-fix ==="

cp "$PATCHES/panel-version.ts" "$PANEL/src/lib/panel-version.ts"
cp "$PATCHES/panel-releases-feed.ts" "$PANEL/src/lib/panel-releases-feed.ts"
cp "$PATCHES/panel-update-route.ts" "$PANEL/src/app/api/admin/panel-update/route.ts"
cp "$PATCHES/admin-settings-updates-page.tsx" "$PANEL/src/app/admin/settings/updates/page.tsx"
cp "$PATCHES/panel-update-banner.tsx" "$PANEL/src/components/panel-update-banner.tsx" 2>/dev/null || true
cp "$PATCHES/panel-update-confirm-modal.tsx" "$PANEL/src/components/panel-update-confirm-modal.tsx" 2>/dev/null || true

if grep -q '@85.17.162.54:5432' "$PANEL/.env" 2>/dev/null; then
  sed -i 's|@85.17.162.54:5432|@127.0.0.1:5432|g' "$PANEL/.env"
  echo "Fixed DATABASE_URL to use 127.0.0.1"
fi

cp "$PATCHES/ecosystem.config.cjs" "$PANEL/ecosystem.config.cjs" 2>/dev/null || true

cd "$PANEL"
npm run build
pm2 startOrRestart ecosystem.config.cjs --only nexlify --update-env

echo "Panel updates loading fix applied."
