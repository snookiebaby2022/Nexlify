#!/usr/bin/env bash
# Auto-categorize VOD imports + TMDB metadata when API key is configured.
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-vod-auto-categorize ==="

cp "$PATCHES/vod-category.ts" "$PANEL/src/lib/vod-category.ts"
cp "$PATCHES/vod-tmdb-enrich.ts" "$PANEL/src/lib/vod-tmdb-enrich.ts"
cp "$PATCHES/import-media.ts" "$PANEL/src/lib/import-media.ts"
cp "$PATCHES/stream-create-data.ts" "$PANEL/src/lib/stream-create-data.ts"

cd "$PANEL"
npm run build
pm2 restart nexlify

echo "apply-vod-auto-categorize done"
