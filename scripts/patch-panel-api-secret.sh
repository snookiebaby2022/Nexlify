#!/usr/bin/env bash
# Add PANEL_API_SECRET to a panel's .env if missing.
# Run on the target server: sudo bash scripts/patch-panel-api-secret.sh
#
# This enables remote management features (unlock-IP, remote-update, license sync)
# between the marketing site and customer panels.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/home/nexlify}"
PANEL_API_SECRET="21ea28d45f9d1e1e6d5fd76cd4c078d46d5f3d531f1a6d25"

if [ ! -f "$PANEL_DIR/.env" ]; then
  echo "ERROR: $PANEL_DIR/.env not found"
  exit 1
fi

added=0
for key in PANEL_API_SECRET NEXLIFY_PANEL_API_SECRET PANEL_INTERNAL_SECRET; do
  if grep -q "^${key}=" "$PANEL_DIR/.env" 2>/dev/null; then
    echo "  $key already set"
  else
    echo "${key}=${PANEL_API_SECRET}" >> "$PANEL_DIR/.env"
    echo "  $key added"
    added=1
  fi
done

if [ "$added" -eq 1 ]; then
  echo ""
  echo "Restarting panel..."
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart nexlify --update-env 2>/dev/null || pm2 restart all --update-env
    echo "Done. Remote management should now work."
  else
    echo "PM2 not found — restart the panel manually."
  fi
else
  echo ""
  echo "All secrets already present. No changes needed."
fi
