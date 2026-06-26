#!/bin/bash
# Clear WHMCS System Health: OPcache + Web Server Support warnings on nginx.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
PRIVATE_CRON="${PRIVATE_CRON:-/var/www/whmcs_private/crons/cron.php}"

echo "=== ensure-whmcs-opcache-nginx ==="

# WHMCS docs: disable OPcache for WHMCS (stale bytecode breaks updates/gateways)
cat > /etc/php/8.3/fpm/conf.d/99-whmcs-opcache.ini <<'INI'
; WHMCS — OPcache disabled for FPM (panel/Node apps do not use this pool)
opcache.enable=0
opcache.enable_cli=0
INI

# CLI cron inherits disable when run with -d opcache.enable_cli=0 in crontab
if [ -f "$PRIVATE_CRON" ]; then
  ( crontab -l 2>/dev/null | grep -v 'whmcs.*cron.php' || true
    echo "*/5 * * * * /usr/bin/php -d opcache.enable_cli=0 -q $PRIVATE_CRON >/dev/null 2>&1"
  ) | crontab -
fi

# Nginx hardening + Apache-style SERVER_SOFTWARE for health check
if [ -f "$APP_DIR/deploy/nginx-billing.nexlify.live.conf" ]; then
  cp "$APP_DIR/deploy/nginx-billing.nexlify.live.conf" /etc/nginx/sites-available/billing.nexlify.live
  ln -sf /etc/nginx/sites-available/billing.nexlify.live /etc/nginx/sites-enabled/billing.nexlify.live
  nginx -t
  systemctl reload nginx
fi

systemctl restart php8.3-fpm

echo "Verify (should show opcache=off, software=Apache...):"
php -r 'echo "cli-opcache=".(ini_get("opcache.enable")?"on":"off")."\n";'

echo "ensure-whmcs-opcache-nginx done — refresh WHMCS System Health"
