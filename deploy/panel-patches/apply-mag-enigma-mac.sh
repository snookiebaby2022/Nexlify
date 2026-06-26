#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-mag-enigma-mac ==="

cp "$PATCHES/device-line-create.ts" "$PANEL/src/lib/device-line-create.ts"
cp "$PATCHES/device-add-form.tsx" "$PANEL/src/components/device-add-form.tsx"
cp "$PATCHES/device-portal-banner.tsx" "$PANEL/src/components/device-portal-banner.tsx"
cp "$PATCHES/mag-route.ts" "$PANEL/src/app/api/admin/mag/route.ts"
cp "$PATCHES/enigma-route.ts" "$PANEL/src/app/api/admin/enigma/route.ts"
cp "$PATCHES/admin-mag-add-page.tsx" "$PANEL/src/app/admin/mag/add/page.tsx"
cp "$PATCHES/admin-enigmas-add-page.tsx" "$PANEL/src/app/admin/enigmas/add/page.tsx"
cp "$PATCHES/admin-mag-page.tsx" "$PANEL/src/app/admin/mag/page.tsx"
cp "$PATCHES/admin-enigmas-page.tsx" "$PANEL/src/app/admin/enigmas/page.tsx"
cp "$PATCHES/admin-settings-server-page.tsx" "$PANEL/src/app/admin/settings/server/page.tsx"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env 2>/dev/null || true

echo "MAG / Enigma MAC-only add + portal URL settings applied."
