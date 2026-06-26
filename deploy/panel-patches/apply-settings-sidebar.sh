#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-settings-sidebar ==="

cp "$PATCHES/nav-item-icons.tsx" "$PANEL/src/lib/nav-item-icons.tsx"
cp "$PATCHES/settings-layout.tsx" "$PANEL/src/components/settings-layout.tsx"
cp "$PATCHES/panel-sidebar-version.tsx" "$PANEL/src/components/panel-sidebar-version.tsx"
cp "$PATCHES/panel-update-progress.tsx" "$PANEL/src/components/panel-update-progress.tsx"

node "$PATCHES/patch-settings-sidebar-css.mjs" "$PANEL/src/app/globals.css"

cd "$PANEL"
NODE_ENV=production npm run build
pm2 restart nexlify --update-env

echo "Settings sidebar version + colored icons applied."
