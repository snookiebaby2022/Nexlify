#!/usr/bin/env bash
# panel.nexlify.live must hit the IPTV panel app, not the marketing site on the same port.
# This script checks PM2, prints what listens on 3000, and reminds how to split ports.
set -euo pipefail

PANEL_ROOT="${PANEL_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
MARKETING_PORT="${MARKETING_PORT:-3001}"
PANEL_PORT="${PANEL_PORT:-3000}"

echo "=== PM2 processes ==="
pm2 list 2>/dev/null || echo "pm2 not found"

echo ""
echo "=== Who listens on ${PANEL_PORT}? ==="
ss -tlnp 2>/dev/null | grep ":${PANEL_PORT} " || true

echo ""
echo "=== HTTP body check (marketing vs panel) ==="
BODY="$(curl -fsS "http://127.0.0.1:${PANEL_PORT}/" 2>/dev/null | head -c 2000 || true)"
if echo "$BODY" | grep -q "IPTV Panel Licenses\|Get license\|WHMCS"; then
  echo "Port ${PANEL_PORT} is serving the MARKETING website (wrong app for panel subdomain)."
elif echo "$BODY" | grep -qi "login\|panel\|xtream"; then
  echo "Port ${PANEL_PORT} looks like the IPTV panel app."
else
  echo "Could not classify app on port ${PANEL_PORT}."
fi

echo ""
echo "=== Fix (manual) ==="
echo "1) Panel IPTV app (this repo) on 127.0.0.1:${PANEL_PORT}:"
echo "   cd $PANEL_ROOT"
echo "   grep PANEL_BEHIND_NGINX=1 .env && pm2 restart nexlify --update-env"
echo ""
echo "2) Marketing site on 127.0.0.1:${MARKETING_PORT} (separate folder + PM2 name, e.g. nexlify-web)"
echo ""
echo "3) nginx:"
echo "   panel.nexlify.live  -> http://127.0.0.1:${PANEL_PORT}"
echo "   nexlify.live        -> http://127.0.0.1:${MARKETING_PORT}"
echo ""
echo "4) .env panel: PANEL_PRIMARY_DOMAIN=panel.nexlify.live"
echo "   NEXT_PUBLIC_SERVER_URL=https://panel.nexlify.live"
echo ""
echo "5) Open https://panel.nexlify.live/login (not / only)"
