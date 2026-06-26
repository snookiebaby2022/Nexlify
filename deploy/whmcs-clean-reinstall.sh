#!/bin/bash
# Complete WHMCS wipe + fresh extract from zip on VPS
set -euo pipefail

ZIP="${1:-/tmp/whmcs_v904_full.zip}"
WHMCS_ROOT="/var/www/whmcs"
EXTRACT="/tmp/whmcs-fresh-extract"
MODULE_SRC="/var/www/nexlify/whmcs/modules/servers/streambilling"
APP_DIR="/var/www/nexlify"

echo "=== WHMCS clean reinstall ==="
echo "ZIP: $ZIP"

[ -f "$ZIP" ] || { echo "FAIL: zip not found at $ZIP"; exit 1; }

echo "Removing old WHMCS files..."
rm -rf "$WHMCS_ROOT"
mkdir -p "$WHMCS_ROOT"

echo "Resetting database..."
mysql -e "DROP DATABASE IF EXISTS whmcs;"
mysql -e "CREATE DATABASE whmcs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "GRANT ALL PRIVILEGES ON whmcs.* TO 'whmcs'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null || {
  echo "WARN: whmcs DB user missing — create with:"
  echo "  CREATE USER 'whmcs'@'localhost' IDENTIFIED BY 'your-password';"
}

rm -rf "$EXTRACT"
mkdir -p "$EXTRACT"
unzip -q -o "$ZIP" -d "$EXTRACT"

SRC="$EXTRACT"
if [ ! -f "$SRC/clientarea.php" ]; then
  inner=$(find "$EXTRACT" -maxdepth 3 -name clientarea.php -printf '%h\n' | head -1)
  [ -n "$inner" ] && SRC="$inner"
fi
[ -f "$SRC/clientarea.php" ] || { echo "FAIL: invalid WHMCS zip"; exit 1; }

echo "Installing from: $SRC"
rsync -a "$SRC/" "$WHMCS_ROOT/"

mkdir -p "$WHMCS_ROOT/modules/servers/streambilling"
if [ -d "$MODULE_SRC" ]; then
  cp -f "$MODULE_SRC"/* "$WHMCS_ROOT/modules/servers/streambilling/"
fi

for d in templates_c attachments downloads; do
  mkdir -p "$WHMCS_ROOT/$d"
  chmod 775 "$WHMCS_ROOT/$d"
done

bash "$APP_DIR/deploy/ensure-ioncube.sh"
bash "$APP_DIR/deploy/ensure-whmcs-permissions.sh"
bash "$APP_DIR/deploy/ensure-billing-ssl.sh" 2>/dev/null || nginx -t && systemctl reload nginx

echo ""
echo "=== Fresh WHMCS ready ==="
echo "  Install: https://billing.nexlify.live/install/install.php"
echo "  DB host: localhost | DB: whmcs | user: whmcs"
echo "  After install: rm -rf $WHMCS_ROOT/install"
echo "  Cron: */5 * * * * /usr/bin/php -q $WHMCS_ROOT/crons/cron.php"
