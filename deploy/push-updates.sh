#!/usr/bin/env bash
set -euo pipefail
APP=/var/www/nexlify
PANEL=/home/nexlify-panel
RELAY=/opt/nexlify-music-relay

echo "=== music-relay ==="
rsync -a "$APP/music-relay/" "$RELAY/" --exclude node_modules --exclude dist --exclude .env
cd "$RELAY" && npm ci 2>/dev/null || npm install
npm run build
pm2 restart music-relay

echo "=== panel patches ==="
bash "$APP/deploy/panel-patches/apply-plugin-upgrades.sh"

echo "=== nexlify-web ==="
cd "$APP" && npm run build && pm2 restart nexlify-web

echo "=== WHMCS module ==="
cp "$APP/whmcs/modules/servers/streambilling/streambilling.php" /var/www/whmcs/modules/servers/streambilling/streambilling.php 2>/dev/null || true

echo "=== WHMCS return redirect ==="
bash "$APP/deploy/ensure-whmcs-return-url.sh"

echo "=== WHMCS GBP currency ==="
bash "$APP/deploy/ensure-whmcs-gbp-currency.sh"

echo "Done."
