#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-country-flags ==="

cp "$PATCHES/ip-country.ts" "$PANEL/src/lib/ip-country.ts"
cp "$PATCHES/ip-with-flag.tsx" "$PANEL/src/components/ip-with-flag.tsx"

mkdir -p "$PANEL/src/app/api/admin/ip-country"
cp "$PATCHES/api-ip-country-route.ts" "$PANEL/src/app/api/admin/ip-country/route.ts"

cp "$PATCHES/admin-connections-page.tsx" "$PANEL/src/app/admin/connections/page.tsx"
cp "$PATCHES/admin-servers-page.tsx" "$PANEL/src/app/admin/servers/page.tsx"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env 2>/dev/null || true

echo "Country flag icons applied to connections and servers views."
