#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-sidebar-installed-version ==="

cp "$PATCHES/panel-sidebar.tsx" "$PANEL/src/components/panel-sidebar.tsx"
cp "$PATCHES/panel-sidebar-version.tsx" "$PANEL/src/components/panel-sidebar-version.tsx"
test -f "$PATCHES/panel-sidebar-report.tsx" && cp "$PATCHES/panel-sidebar-report.tsx" "$PANEL/src/components/panel-sidebar-report.tsx" || true

node "$PATCHES/patch-sidebar-version-css.mjs" "$PANEL/src/app/globals.css" "$PATCHES/sidebar-version.css"

cd "$PANEL"
NODE_ENV=production npm run build
pm2 restart nexlify --update-env

echo "Left sidebar: Installed v*.*.* deployed."
