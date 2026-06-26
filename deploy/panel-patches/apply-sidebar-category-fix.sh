#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

cp "$PATCHES/panel-sidebar.tsx" "$PANEL/src/components/panel-sidebar.tsx"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env 2>/dev/null || true

echo "Sidebar category accordion fix applied."
