#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"
SRC="${PANEL_PATCH_SRC:-$(dirname "$PATCHES")/../../nexlify-panel}"

echo "=== apply-panel-v1.4.0 ==="

bump_version() {
  node -e "
const fs=require('fs');
const p='$1';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.version='1.4.0';
fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
console.log('package.json ->', j.version);
"
}

if [[ -f "$SRC/package.json" && "$SRC" != "$PATCHES" ]]; then
  cp "$SRC/package.json" "$PANEL/package.json"
  [[ -f "$SRC/package-lock.json" ]] && cp "$SRC/package-lock.json" "$PANEL/package-lock.json"
  echo "Copied package.json from $SRC"
elif [[ -f "$PATCHES/package.json" ]]; then
  cp "$PATCHES/package.json" "$PANEL/package.json"
  [[ -f "$PATCHES/package-lock.json" ]] && cp "$PATCHES/package-lock.json" "$PANEL/package-lock.json"
  echo "Copied package.json from patches"
else
  bump_version "$PANEL/package.json"
fi

cd "$PANEL"
npm install --include=dev --no-audit --no-fund
NODE_ENV=production npm run build

APP_DIR="${APP_DIR:-/var/www/nexlify}"
export PANEL_DIR="$PANEL"
REBUILD=0 bash "$APP_DIR/deploy/pm2-ensure-panel.sh"

echo "Panel v1.4.0 applied (installed version label + rebuild)."
