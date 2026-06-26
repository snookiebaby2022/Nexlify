#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"
SRC="${PANEL_PATCH_SRC:-$(dirname "$PATCHES")/../../nexlify-panel}"

echo "=== apply-dashboard-widgets ==="

copy() {
  local rel="$1"
  local name="${2:-$(basename "$rel")}"
  mkdir -p "$(dirname "$PANEL/$rel")"
  if [[ -f "$SRC/$rel" ]]; then
    cp "$SRC/$rel" "$PANEL/$rel"
  elif [[ -f "$PATCHES/$rel" ]]; then
    cp "$PATCHES/$rel" "$PANEL/$rel"
  elif [[ -f "$PATCHES/$name" ]]; then
    cp "$PATCHES/$name" "$PANEL/$rel"
  else
    echo "ERROR: missing patch file: $rel (checked $SRC/$rel, $PATCHES/$rel, $PATCHES/$name)" >&2
    return 1
  fi
}

if [[ ! -d "$SRC/src" ]]; then
  SRC="$PATCHES"
  echo "Using patch files from $PATCHES"
else
  echo "Using panel source from $SRC"
fi

for rel in \
  src/lib/dashboard-widgets.ts \
  src/components/dashboard-most-watched-by-country.tsx \
  src/components/dashboard-xui-summary-cards.tsx \
  src/components/panel-dashboard.tsx \
  src/app/api/admin/dashboard-widgets/route.ts \
  src/app/api/reseller/dashboard-widgets/route.ts \
  src/app/admin/dashboard/page.tsx \
  src/app/reseller/dashboard/page.tsx
do
  copy "$rel"
  echo "  + $rel"
done

cd "$PANEL"
npm run build
APP_DIR="${APP_DIR:-/var/www/nexlify}"
export PANEL_DIR="$PANEL"
REBUILD=0 bash "$APP_DIR/deploy/pm2-ensure-panel.sh"
bash "$APP_DIR/deploy/install-panel-watchdog.sh" 2>/dev/null || true
echo "=== dashboard widgets applied ==="
