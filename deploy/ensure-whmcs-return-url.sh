#!/bin/bash
# Install WHMCS post-checkout redirect hook → nexlify.live/order/success
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
WHMCS_ROOT="${WHMCS_ROOT:-/var/www/whmcs}"
HOOK_SRC="$APP_DIR/whmcs/includes/hooks/nexlify-return.php"
HOOK_DST="$WHMCS_ROOT/includes/hooks/nexlify-return.php"

echo "=== ensure-whmcs-return-url ==="

[ -f "$HOOK_SRC" ] || {
  echo "Missing hook source: $HOOK_SRC"
  exit 1
}

mkdir -p "$WHMCS_ROOT/includes/hooks"
cp -f "$HOOK_SRC" "$HOOK_DST"
chown www-data:www-data "$HOOK_DST"
chmod 644 "$HOOK_DST"

rm -rf "$WHMCS_ROOT/templates_c/"* 2>/dev/null || true
systemctl reload php8.3-fpm 2>/dev/null || systemctl reload php-fpm 2>/dev/null || true

echo "Installed: $HOOK_DST → https://nexlify.live/order/success"
echo "ensure-whmcs-return-url done."
