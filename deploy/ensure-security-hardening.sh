#!/usr/bin/env bash
# Master security pass — env secrets, permissions, DB, disk audit, nginx headers.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"

echo "=== ensure-security-hardening ==="

bash "$APP_DIR/deploy/ensure-security-env.sh"
bash "$APP_DIR/deploy/ensure-secrets-permissions.sh"
bash "$APP_DIR/deploy/ensure-postgres-hardening.sh" || echo "WARN: postgres hardening skipped"
bash "$APP_DIR/deploy/ensure-disk-encryption-audit.sh" || true

if [ -f "$APP_DIR/deploy/nginx-security-headers.conf" ]; then
  for conf in /etc/nginx/sites-available/nexlify.live \
    /etc/nginx/sites-available/panel.nexlify.live \
    /etc/nginx/sites-available/panel.demo.nexlify.live \
    /etc/nginx/sites-available/billing.nexlify.live; do
    [ -f "$conf" ] || continue
    if ! grep -q nginx-security-headers.conf "$conf" 2>/dev/null; then
      sed -i '/ssl_dhparam/a\    include '"$APP_DIR"'/deploy/nginx-security-headers.conf;' "$conf" 2>/dev/null || true
    fi
  done
  nginx -t && systemctl reload nginx 2>/dev/null || true
fi

echo "ensure-security-hardening done."
