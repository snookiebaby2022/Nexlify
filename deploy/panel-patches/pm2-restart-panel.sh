#!/usr/bin/env bash
# Call from any panel patch script after copying files / building.
# Replaces fragile: pm2 restart nexlify 2>/dev/null || true
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"
REBUILD="${REBUILD:-0}"

# If caller just ran npm run build in panel dir, skip rebuild
if [ -d "${PANEL_ROOT:-/home/nexlify-panel}/.next" ]; then
  REBUILD=0
fi

export REBUILD
bash "$APP_DIR/deploy/pm2-ensure-panel.sh"
