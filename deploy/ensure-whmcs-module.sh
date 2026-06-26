#!/bin/bash
# Sync StreamForge WHMCS server module into the live billing install.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
WHMCS_ROOT="${WHMCS_ROOT:-/var/www/whmcs}"
MODULE_SRC="$APP_DIR/whmcs/modules/servers/streambilling"
MODULE_DST="$WHMCS_ROOT/modules/servers/streambilling"

echo "=== ensure-whmcs-module ==="

[ -f "$MODULE_SRC/streambilling.php" ] || {
  echo "Missing module source: $MODULE_SRC/streambilling.php"
  exit 1
}

mkdir -p "$MODULE_DST"
cp -f "$MODULE_SRC/streambilling.php" "$MODULE_DST/streambilling.php"
[ -f "$MODULE_SRC/README.md" ] && cp -f "$MODULE_SRC/README.md" "$MODULE_DST/README.md" || true

chown www-data:www-data "$MODULE_DST/streambilling.php"
chmod 644 "$MODULE_DST/streambilling.php"

rm -rf "$WHMCS_ROOT/templates_c/"* 2>/dev/null || true
systemctl reload php8.3-fpm 2>/dev/null || systemctl reload php-fpm 2>/dev/null || true

grep -E "RequiresServer|DisplayName" "$MODULE_DST/streambilling.php" | head -3
echo "ensure-whmcs-module done."
