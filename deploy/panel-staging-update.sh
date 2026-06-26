#!/usr/bin/env bash
# Owner staging: apply all IPTV panel patches, rebuild, verify at panel.nexlify.live/login
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"
PATCHES="$APP_DIR/deploy/panel-patches"
STAGING_URL="${PANEL_STAGING_URL:-https://panel.nexlify.live/login}"

echo "=============================================="
echo " Panel staging update (owner preview only)"
echo " Staging URL: $STAGING_URL"
echo " Panel dir:   $PANEL_DIR"
echo "=============================================="

if [ ! -d "$PATCHES" ]; then
  echo "FAIL: $PATCHES not found — deploy stream-billing to $APP_DIR first"
  exit 1
fi

if [ ! -f "$PANEL_DIR/package.json" ]; then
  echo "FAIL: IPTV panel not found at $PANEL_DIR"
  exit 1
fi

export APP_DIR PANEL_DIR PANEL_ROOT="$PANEL_DIR"

run_patch() {
  local script="$1"
  if [ ! -f "$PATCHES/$script" ]; then
    echo "WARN: skip missing $script"
    return 0
  fi
  echo ""
  echo ">>> $script"
  bash "$PATCHES/$script"
}

run_patch apply-patches.sh
run_patch apply-addons-patch.sh
run_patch apply-integrations-streaming.sh
run_patch apply-whmcs-addons.sh
run_patch apply-plugin-upgrades.sh
run_patch apply-radio-playback.sh
run_patch apply-bouquet-access-mass.sh
run_patch apply-group-table-header-fix.sh

echo ""
echo "Health:"
curl -sf "http://127.0.0.1:3000/api/health" && echo " panel :3000 OK" || echo " panel health FAIL"

echo ""
echo "=============================================="
echo " Staging ready — test in browser:"
echo "   $STAGING_URL"
echo ""
echo " When satisfied, roll out the same patches to"
echo " customer panels (or publish a panel release)."
echo "=============================================="
