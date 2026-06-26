#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-mag-convert-to-line ==="

cp "$PATCHES/mag-convert-to-line.ts" "$PANEL/src/lib/mag-convert-to-line.ts"

mkdir -p "$PANEL/src/app/api/admin/mag/convert-to-line"
cp "$PATCHES/mag-convert-to-line-route.ts" "$PANEL/src/app/api/admin/mag/convert-to-line/route.ts"

mkdir -p "$PANEL/src/app/admin/mag/convert-to-line"
cp "$PATCHES/admin-mag-convert-to-line-page.tsx" "$PANEL/src/app/admin/mag/convert-to-line/page.tsx"

mkdir -p "$PANEL/src/app/reseller/mags/convert-to-line"
cp "$PATCHES/reseller-mags-convert-to-line-page.tsx" "$PANEL/src/app/reseller/mags/convert-to-line/page.tsx"

cp "$PATCHES/admin-sidebar-nav.tsx" "$PANEL/src/lib/admin-sidebar-nav.tsx"
cp "$PATCHES/reseller-sidebar-nav.tsx" "$PANEL/src/lib/reseller-sidebar-nav.tsx"
cp "$PATCHES/nav-item-icons.tsx" "$PANEL/src/lib/nav-item-icons.tsx"
cp "$PATCHES/admin-mag-page.tsx" "$PANEL/src/app/admin/mag/page.tsx"
cp "$PATCHES/reseller-mags-page.tsx" "$PANEL/src/app/reseller/mags/page.tsx"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env 2>/dev/null || true

echo "MAG convert-to-line: sidebar, bulk page, API, and manage actions applied."
