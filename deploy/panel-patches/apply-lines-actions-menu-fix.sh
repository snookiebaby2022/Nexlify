#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-lines-actions-menu-fix ==="

cp "$PATCHES/line-row-actions-menu.tsx" "$PANEL/src/components/line-row-actions-menu.tsx"
cp "$PATCHES/manage-lines-table.tsx" "$PANEL/src/components/manage-lines-table.tsx"

node "$PATCHES/patch-lines-action-css.mjs" "$PANEL/src/app/globals.css" "$PATCHES/lines-action-menu.css"

cd "$PANEL"
NODE_ENV=production npm run build
pm2 restart nexlify --update-env

echo "Lines Actions menu fix applied."
