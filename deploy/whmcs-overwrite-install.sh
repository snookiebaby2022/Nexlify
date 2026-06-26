#!/bin/bash
# Overwrite /var/www/whmcs from uploaded WHMCS full zip (preserves config + user data dirs)
set -euo pipefail

ZIP="${1:-/tmp/whmcs_v904_full.zip}"
WHMCS_ROOT="/var/www/whmcs"
EXTRACT="/tmp/whmcs-v904-extract"
BACKUP="/tmp/whmcs-preserve-$(date +%s)"
MODULE_SRC="/var/www/nexlify/whmcs/modules/servers/streambilling"

echo "=== WHMCS overwrite from $ZIP ==="

[ -f "$ZIP" ] || { echo "Missing zip: $ZIP"; exit 1; }

mkdir -p "$BACKUP"
[ -f "$WHMCS_ROOT/configuration.php" ] && cp -a "$WHMCS_ROOT/configuration.php" "$BACKUP/"
for d in attachments downloads templates_c; do
  [ -d "$WHMCS_ROOT/$d" ] && cp -a "$WHMCS_ROOT/$d" "$BACKUP/" || true
done

rm -rf "$EXTRACT"
mkdir -p "$EXTRACT"
unzip -q -o "$ZIP" -d "$EXTRACT"

# Zip may extract flat or one subfolder
SRC="$EXTRACT"
if [ ! -f "$SRC/clientarea.php" ]; then
  inner=$(find "$EXTRACT" -maxdepth 2 -name clientarea.php -printf '%h\n' | head -1)
  [ -n "$inner" ] && SRC="$inner"
fi
[ -f "$SRC/clientarea.php" ] || { echo "Invalid WHMCS zip — no clientarea.php"; exit 1; }

echo "Extracted from: $SRC"
rsync -a --delete "$SRC/" "$WHMCS_ROOT/"

[ -f "$BACKUP/configuration.php" ] && cp -a "$BACKUP/configuration.php" "$WHMCS_ROOT/configuration.php"

for d in attachments downloads templates_c; do
  [ -d "$BACKUP/$d" ] && rsync -a "$BACKUP/$d/" "$WHMCS_ROOT/$d/" || mkdir -p "$WHMCS_ROOT/$d"
done

if [ -d "$MODULE_SRC" ]; then
  mkdir -p "$WHMCS_ROOT/modules/servers/streambilling"
  cp -f "$MODULE_SRC"/* "$WHMCS_ROOT/modules/servers/streambilling/"
fi

APP_DIR="/var/www/nexlify"
[ -f "$APP_DIR/deploy/ensure-ioncube.sh" ] && bash "$APP_DIR/deploy/ensure-ioncube.sh" || true
[ -f "$APP_DIR/deploy/ensure-whmcs-permissions.sh" ] && bash "$APP_DIR/deploy/ensure-whmcs-permissions.sh"

echo "WHMCS version files:"
head -3 "$WHMCS_ROOT/admin/version.php" 2>/dev/null || true
ls -la "$WHMCS_ROOT/clientarea.php" "$WHMCS_ROOT/configuration.php" 2>/dev/null || true
echo "Done. Open Admin → Utilities → Update WHMCS if a DB migration is required."
echo "Preserve backup: $BACKUP"
