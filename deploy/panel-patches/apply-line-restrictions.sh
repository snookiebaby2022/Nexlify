#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-line-restrictions ==="

bash "$PATCHES/patch-schema-line-restrictions.sh"
cp "$PATCHES/line-restrictions.ts" "$PANEL/src/lib/line-restrictions.ts"
cp "$PATCHES/playback-guard.ts" "$PANEL/src/lib/playback-guard.ts"
cp "$PATCHES/line-playback.ts" "$PANEL/src/lib/line-playback.ts"
cp "$PATCHES/admin-lines-mass-route.ts" "$PANEL/src/app/api/admin/lines/mass/route.ts"
cp "$PATCHES/live-playback-route.ts" "$PANEL/src/app/live/[username]/[password]/[streamId]/route.ts"
cp "$PATCHES/player-api-route.ts" "$PANEL/src/app/player_api.php/route.ts"
cp "$PATCHES/movie-playback-route.ts" "$PANEL/src/app/movie/[username]/[password]/[streamId]/route.ts"

cd "$PANEL"
npx prisma db push --skip-generate
npx prisma generate
NODE_ENV=production npm run build
pm2 restart nexlify --update-env

echo "Line restrictions applied (canWatchAdult + User-Agent mass edit)."
