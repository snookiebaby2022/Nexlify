#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-subscriptions-nav ==="

cp "$PATCHES/admin-sidebar-nav.tsx" "$PANEL/src/lib/admin-sidebar-nav.tsx"
cp "$PATCHES/reseller-sidebar-nav.tsx" "$PANEL/src/lib/reseller-sidebar-nav.tsx"
cp "$PATCHES/nav-item-icons.tsx" "$PANEL/src/lib/nav-item-icons.tsx"
cp "$PATCHES/admin-mag-add-page.tsx" "$PANEL/src/app/admin/mag/add/page.tsx"

mkdir -p "$PANEL/src/app/admin/enigmas/add"
cp "$PATCHES/admin-enigmas-add-page.tsx" "$PANEL/src/app/admin/enigmas/add/page.tsx"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env 2>/dev/null || true

echo "Subscriptions sidebar nav updated (Lines, MAG Device, Enigma2, Device Events)."
