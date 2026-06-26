#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply mass edit lines ($PANEL) ==="

cp "$PATCHES/lines-mass-edit-view.tsx" "$PANEL/src/components/lines-mass-edit-view.tsx"
cp "$PATCHES/lines-mass-edit.ts" "$PANEL/src/lib/lines-mass-edit.ts"
cp "$PATCHES/lines-mass-route.ts" "$PANEL/src/app/api/admin/lines/mass/route.ts"

mkdir -p "$PANEL/src/app/admin/lines/mass-edit"
mkdir -p "$PANEL/src/app/reseller/lines/mass-edit"
cp "$PATCHES/admin-lines-mass-edit-page.tsx" "$PANEL/src/app/admin/lines/mass-edit/page.tsx"
cp "$PATCHES/reseller-lines-mass-edit-page.tsx" "$PANEL/src/app/reseller/lines/mass-edit/page.tsx"

if [[ -f "$PATCHES/lines-mass-edit.css" ]]; then
  if ! grep -q 'xui-mass-edit-layout' "$PANEL/src/app/globals.css" 2>/dev/null; then
    printf '\n%s\n' "$(cat "$PATCHES/lines-mass-edit.css")" >> "$PANEL/src/app/globals.css"
    echo "Appended mass-edit CSS to globals.css"
  fi
fi

cd "$PANEL"
NODE_ENV=production npm run build
pm2 restart nexlify --update-env

echo "Mass Edit Lines applied."
