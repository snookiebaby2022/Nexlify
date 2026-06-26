#!/bin/bash
# Fix WHMCS CSRF token + frequent logouts (Cloudflare + nginx)
set -euo pipefail

APP_DIR="/var/www/nexlify"
DOMAIN="billing.nexlify.live"
SYSTEM_URL="https://${DOMAIN}/"

echo "=== ensure-whmcs-csrf-fix ==="

# 1) WHMCS domain + session settings
mysql whmcs <<SQL
UPDATE tblconfiguration SET value='${SYSTEM_URL}' WHERE setting='SystemURL';
UPDATE tblconfiguration SET value='https://${DOMAIN}/' WHERE setting='Domain';
UPDATE tblconfiguration SET value='on' WHERE setting='DisableSessionIPCheck';
SQL

# TrustedProxies — Cloudflare IPv4/IPv6 CIDRs (WHMCS comma-separated)
TRUSTED='173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22,2400:cb00::/32,2606:4700::/32,2803:f800::/32,2405:b500::/32,2405:8100::/32,2a06:98c0::/29,2c0f:f248::/32'
mysql whmcs -e "INSERT INTO tblconfiguration (setting, value) SELECT 'TrustedProxies', '${TRUSTED}' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tblconfiguration WHERE setting='TrustedProxies');"
mysql whmcs -e "UPDATE tblconfiguration SET value='${TRUSTED}' WHERE setting='TrustedProxies';"

# 2) PHP sessions writable + secure cookies behind HTTPS
mkdir -p /var/lib/php/sessions
chown www-data:www-data /var/lib/php/sessions
chmod 1733 /var/lib/php/sessions

cat > /etc/php/8.3/fpm/conf.d/99-whmcs-session.ini <<'INI'
session.save_path = /var/lib/php/sessions
session.cookie_secure = 1
session.cookie_httponly = 1
session.cookie_samesite = Lax
INI

cat > /etc/php/8.3/cli/conf.d/99-whmcs-session.ini <<'INI'
session.save_path = /var/lib/php/sessions
INI

systemctl restart php8.3-fpm

# 3) Cloudflare real IP + HTTPS headers for nginx
{
  echo "# Cloudflare real IP ranges"
  curl -fsSL https://www.cloudflare.com/ips-v4 | sed 's/^/set_real_ip_from /;s/$/;/'
  curl -fsSL https://www.cloudflare.com/ips-v6 | sed 's/^/set_real_ip_from /;s/$/;/'
  echo "real_ip_header CF-Connecting-IP;"
  echo "real_ip_recursive on;"
} > /etc/nginx/cloudflare-realip.conf

cp "$APP_DIR/deploy/nginx-billing.nexlify.live.conf" /etc/nginx/sites-available/billing.nexlify.live
ln -sf /etc/nginx/sites-available/billing.nexlify.live /etc/nginx/sites-enabled/billing.nexlify.live

nginx -t
systemctl reload nginx

echo ""
echo "Fixed:"
mysql whmcs -e "SELECT setting, LEFT(value,60) AS value FROM tblconfiguration WHERE setting IN ('SystemURL','Domain','DisableSessionIPCheck','TrustedProxies');"
echo "Clear browser cookies for ${DOMAIN} and log in again."
echo "Cloudflare: SSL Full (strict), purge cache."
