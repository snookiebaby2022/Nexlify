#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply bouquet access mass edit ($PANEL) ==="

cp "$PATCHES/reseller-bouquets-page.tsx" "$PANEL/src/app/admin/resellers/bouquets/page.tsx"
cp "$PATCHES/management-mass-edit-hub.tsx" "$PANEL/src/app/admin/management/mass-edit/page.tsx"

mkdir -p "$PANEL/src/app/api/admin/resellers/bouquets/mass"
cp "$PATCHES/reseller-bouquets-mass-route.ts" "$PANEL/src/app/api/admin/resellers/bouquets/mass/route.ts"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env

echo "bouquet access mass edit applied"
