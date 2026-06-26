#!/usr/bin/env bash
# Panel-to-panel transfer (export/import) + provider URL bulk tools.
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "Applying panel transfer + provider URL tools to $PANEL ..."

cp "$PATCHES/panel-transfer-export.ts" "$PANEL/src/lib/panel-transfer-export.ts"
cp "$PATCHES/panel-transfer-import.ts" "$PANEL/src/lib/panel-transfer-import.ts"
cp "$PATCHES/provider-url-bulk.ts" "$PANEL/src/lib/provider-url-bulk.ts"

mkdir -p "$PANEL/src/app/api/admin/panel-transfer/export"
mkdir -p "$PANEL/src/app/api/admin/panel-transfer/import"
mkdir -p "$PANEL/src/app/api/admin/tools/provider-urls"
mkdir -p "$PANEL/src/app/admin/import/transfer"
mkdir -p "$PANEL/src/app/admin/management/tools/provider-urls"

cp "$PATCHES/api-panel-transfer-export-route.ts" "$PANEL/src/app/api/admin/panel-transfer/export/route.ts"
cp "$PATCHES/api-panel-transfer-import-route.ts" "$PANEL/src/app/api/admin/panel-transfer/import/route.ts"
cp "$PATCHES/api-provider-urls-route.ts" "$PANEL/src/app/api/admin/tools/provider-urls/route.ts"

cp "$PATCHES/panel-transfer-tools.tsx" "$PANEL/src/components/panel-transfer-tools.tsx"
cp "$PATCHES/provider-url-tools.tsx" "$PANEL/src/components/provider-url-tools.tsx"
cp "$PATCHES/admin-import-transfer-page.tsx" "$PANEL/src/app/admin/import/transfer/page.tsx"
cp "$PATCHES/admin-provider-urls-page.tsx" "$PANEL/src/app/admin/management/tools/provider-urls/page.tsx"

# Sidebar nav links
NAV="$PANEL/src/lib/admin-sidebar-nav.tsx"
if ! grep -q 'import/transfer' "$NAV"; then
  sed -i 's|{ href: "/admin/import/migrate", label: "Panel Migration" },|{ href: "/admin/import/migrate", label: "Panel Migration" },\n          { href: "/admin/import/transfer", label: "Panel Transfer" },|' "$NAV"
fi
if ! grep -q 'provider-urls' "$NAV"; then
  sed -i 's|{ href: "/admin/management/tools/stream-tools", label: "Stream Tools" },|{ href: "/admin/management/tools/stream-tools", label: "Stream Tools" },\n          { href: "/admin/management/tools/provider-urls", label: "Provider URL Tools" },|' "$NAV"
fi

cp "$PATCHES/management-tools-page.tsx" "$PANEL/src/app/admin/management/tools/page.tsx"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env 2>/dev/null || pm2 restart panel --update-env 2>/dev/null || true

echo "Panel transfer + provider URL tools deployed."
