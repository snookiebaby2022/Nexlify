#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-actions-menu-portal-fix ==="

cp "$PATCHES/line-row-actions-menu.tsx" "$PANEL/src/components/line-row-actions-menu.tsx"
cp "$PATCHES/manage-lines-table.tsx" "$PANEL/src/components/manage-lines-table.tsx"
cp "$PATCHES/server-actions-menu.tsx" "$PANEL/src/components/server-actions-menu.tsx"
cp "$PATCHES/portal-menu-position.ts" "$PANEL/src/lib/portal-menu-position.ts"
cp "$PATCHES/use-media-query.ts" "$PANEL/src/lib/use-media-query.ts"

cd "$PANEL"
NODE_ENV=production npm run build
pm2 restart nexlify --update-env

echo "Actions menu portal fix applied."
