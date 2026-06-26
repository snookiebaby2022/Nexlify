#!/usr/bin/env bash
# Lock down .env, license keys, SSH, and app data directories (runs every deploy).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"
WHMCS_DIR="${WHMCS_DIR:-/var/www/whmcs}"

echo "=== ensure-secrets-permissions ==="

lock_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  chmod 600 "$f"
  chown root:root "$f" 2>/dev/null || true
  echo "  chmod 600 $f"
}

lock_dir() {
  local d="$1"
  [ -d "$d" ] || return 0
  chmod 700 "$d"
  echo "  chmod 700 $d"
}

lock_file "$APP_DIR/.env"
lock_file "$PANEL_DIR/.env"
lock_file "$WHMCS_DIR/configuration.php" 2>/dev/null || true

for dir in \
  "$APP_DIR/data" \
  "$PANEL_DIR/.license-keys" \
  "$PANEL_DIR/prisma" \
  "/root/.ssh"; do
  lock_dir "$dir"
done

if [ -d "$PANEL_DIR/.license-keys" ]; then
  find "$PANEL_DIR/.license-keys" -type f -exec chmod 600 {} \; 2>/dev/null || true
fi

if [ -f /root/.ssh/authorized_keys ]; then
  chmod 600 /root/.ssh/authorized_keys
fi

# Never commit or world-read deploy archives
[ -f "$APP_DIR/nexlify-deploy.tar.gz" ] && chmod 600 "$APP_DIR/nexlify-deploy.tar.gz" || true

echo "ensure-secrets-permissions done."
