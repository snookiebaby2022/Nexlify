#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-operator-upgrades ==="

# Schema: ActiveCode on Line
bash "$PATCHES/patch-schema-activecode.sh"

# Libs
cp "$PATCHES/outbound-webhooks.ts" "$PANEL/src/lib/outbound-webhooks.ts"
cp "$PATCHES/connection-map-geo.ts" "$PANEL/src/lib/connection-map-geo.ts"
cp "$PATCHES/xui-api.ts" "$PANEL/src/lib/xui-api.ts"
cp "$PATCHES/lines.ts" "$PANEL/src/lib/lines.ts"
cp "$PATCHES/xui-admin-modules.ts" "$PANEL/src/lib/xui-admin-modules.ts"

# API routes
mkdir -p "$PANEL/src/app/api/admin/webhooks"
cp "$PATCHES/api-webhooks-route.ts" "$PANEL/src/app/api/admin/webhooks/route.ts"
mkdir -p "$PANEL/src/app/api/admin/connection-map"
cp "$PATCHES/api-connection-map-route.ts" "$PANEL/src/app/api/admin/connection-map/route.ts"
mkdir -p "$PANEL/src/app/api/admin/analytics"
cp "$PATCHES/api-analytics-route.ts" "$PANEL/src/app/api/admin/analytics/route.ts"
mkdir -p "$PANEL/src/app/api/admin/hmac-secret"
cp "$PATCHES/api-hmac-route.ts" "$PANEL/src/app/api/admin/hmac-secret/route.ts"
cp "$PATCHES/auth-login-route.ts" "$PANEL/src/app/api/auth/login/route.ts"

# Components
cp "$PATCHES/connection-map.tsx" "$PANEL/src/components/connection-map.tsx"
cp "$PATCHES/activity-logs-page.tsx" "$PANEL/src/components/activity-logs-page.tsx"
cp "$PATCHES/admin-access-codes-page.tsx" "$PANEL/src/components/admin-access-codes-page.tsx"
cp "$PATCHES/admin-webhooks-page.tsx" "$PANEL/src/components/admin-webhooks-page.tsx"
cp "$PATCHES/admin-videolog-page.tsx" "$PANEL/src/components/admin-videolog-page.tsx"
cp "$PATCHES/admin-archive-page.tsx" "$PANEL/src/components/admin-archive-page.tsx"
cp "$PATCHES/admin-api-docs-page.tsx" "$PANEL/src/components/admin-api-docs-page.tsx"
cp "$PATCHES/panel-dashboard.tsx" "$PANEL/src/components/panel-dashboard.tsx"

# Admin pages
cp "$PATCHES/page-admin-codes.tsx" "$PANEL/src/app/admin/codes/page.tsx"
cp "$PATCHES/page-client-logs.tsx" "$PANEL/src/app/admin/client_logs/page.tsx"
cp "$PATCHES/page-login-logs.tsx" "$PANEL/src/app/admin/login_logs/page.tsx"
cp "$PATCHES/page-restream-logs.tsx" "$PANEL/src/app/admin/restream_logs/page.tsx"
mkdir -p "$PANEL/src/app/admin/videolog"
cp "$PATCHES/page-videolog.tsx" "$PANEL/src/app/admin/videolog/page.tsx"
cp "$PATCHES/page-archive.tsx" "$PANEL/src/app/admin/archive/page.tsx"
mkdir -p "$PANEL/src/app/admin/webhooks"
cp "$PATCHES/page-webhooks.tsx" "$PANEL/src/app/admin/webhooks/page.tsx"
cp "$PATCHES/page-admin-api.tsx" "$PANEL/src/app/admin/api/page.tsx"

cd "$PANEL"
npm run build
pm2 restart nexlify

echo "apply-operator-upgrades done"
