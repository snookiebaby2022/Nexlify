#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-panel-updates-ui ==="

cp "$PATCHES/panel-releases-feed.ts" "$PANEL/src/lib/panel-releases-feed.ts"
cp "$PATCHES/panel-update.ts" "$PANEL/src/lib/panel-update.ts"
cp "$PATCHES/panel-update-confirm-modal.tsx" "$PANEL/src/components/panel-update-confirm-modal.tsx"
cp "$PATCHES/panel-update-banner.tsx" "$PANEL/src/components/panel-update-banner.tsx"
cp "$PATCHES/panel-shell.tsx" "$PANEL/src/components/panel-shell.tsx"

mkdir -p "$PANEL/src/app/admin/settings/updates"
cp "$PATCHES/admin-settings-updates-page.tsx" "$PANEL/src/app/admin/settings/updates/page.tsx"

mkdir -p "$PANEL/src/app/api/admin/panel-update"
cp "$PATCHES/panel-update-route.ts" "$PANEL/src/app/api/admin/panel-update/route.ts"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env 2>/dev/null || true

echo "Panel updates UI wired to nexlify.live release feed."
