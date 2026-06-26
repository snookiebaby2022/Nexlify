#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply radio playback patches ($PANEL) ==="

cp "$PATCHES/radio-playback.ts" "$PANEL/src/lib/radio-playback.ts"
cp "$PATCHES/radio-probe-player.tsx" "$PANEL/src/components/radio-probe-player.tsx"
cp "$PATCHES/radios-page.tsx" "$PANEL/src/app/admin/radios/page.tsx"
mkdir -p "$PANEL/src/app/api/admin/streams/radio-resolve"
cp "$PATCHES/radio-resolve-route.ts" "$PANEL/src/app/api/admin/streams/radio-resolve/route.ts"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env

echo "radio playback patch applied"
