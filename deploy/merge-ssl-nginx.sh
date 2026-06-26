#!/bin/bash
# After certbot, ensure SSL server block proxies to the app (fixes 502 / CF 526)
set -euo pipefail

APP_DIR="/var/www/nexlify"
CONF="/etc/nginx/sites-available/nexlify.live"
DOMAIN="nexlify.live"

if [ ! -f "$CONF" ]; then
  echo "Missing $CONF"
  exit 1
fi

if grep -q "listen 443" "$CONF" && grep -q "proxy_pass http://nexlify_app" "$CONF"; then
  echo "SSL block already has proxy — OK"
  exit 0
fi

echo "Restoring HTTP config and re-applying Let's Encrypt nginx SSL..."
cp "$APP_DIR/deploy/nginx-nexlify.conf" "$CONF"
ln -sf "$CONF" /etc/nginx/sites-enabled/nexlify.live
nginx -t
systemctl reload nginx

if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --redirect 2>/dev/null || \
    certbot --nginx -d "$DOMAIN" --non-interactive
else
  echo "No cert yet — run: bash $APP_DIR/deploy/enable-ssl.sh"
  exit 1
fi

nginx -t
systemctl reload nginx
echo "Done. Test: curl -sI https://$DOMAIN/ | head -3"
