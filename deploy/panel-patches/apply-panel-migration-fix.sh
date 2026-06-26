#!/usr/bin/env bash
# Fix Xtream UI reseller duplicate import + tighten reseller row detection.
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "Applying panel migration fix to $PANEL ..."

cp "$PATCHES/panel-migration-profiles.ts" "$PANEL/src/lib/panel-migration/profiles.ts"
cp "$PATCHES/panel-migration-map-rows.ts" "$PANEL/src/lib/panel-migration/map-rows.ts"
cp "$PATCHES/panel-migration-postgres.ts" "$PANEL/src/lib/panel-migration/postgres.ts"
cp "$PATCHES/migrate-smoke-test.mjs" "$PANEL/migrate-smoke-test.mjs"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env 2>/dev/null || pm2 restart panel --update-env 2>/dev/null || true

echo "Running migration smoke tests..."
npx tsx migrate-smoke-test.mjs

echo "Panel migration fix applied."
