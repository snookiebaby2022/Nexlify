#!/bin/bash
# Enable HTTPS for nexlify.live (run on VPS as root)
#   bash /var/www/nexlify/deploy/enable-ssl.sh
set -euo pipefail

APP_DIR="/var/www/nexlify"
DOMAIN="nexlify.live"

export DEBIAN_FRONTEND=noninteractive

echo "=== Enable HTTPS for $DOMAIN ==="

command -v nginx >/dev/null || apt-get update && apt-get install -y nginx
command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx

ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true
ufw allow 'Nginx Full' 2>/dev/null || true

if [ -f "$APP_DIR/deploy/nginx-nexlify.conf" ]; then
  cp "$APP_DIR/deploy/nginx-nexlify.conf" /etc/nginx/sites-available/nexlify.live
  ln -sf /etc/nginx/sites-available/nexlify.live /etc/nginx/sites-enabled/nexlify.live
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t
  systemctl reload nginx
fi

# Port 80 must work before certbot (DNS A record -> this server)
if ! curl -sfI --max-time 5 "http://127.0.0.1/" | head -1 | grep -qE '200|301|302'; then
  echo "WARN: nothing on local port 80 — start nexlify first (pm2 status nexlify)"
fi

echo "Requesting certificate (nexlify.live only; add www later if DNS exists)..."
certbot --nginx \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  --redirect

nginx -t
systemctl reload nginx

# Certbot sometimes adds :443 without proxy_pass → origin 502 / Cloudflare 526
if [ -f /etc/nginx/sites-enabled/nexlify.live ] && \
   ! grep -q "proxy_pass http://nexlify_app" /etc/nginx/sites-enabled/nexlify.live; then
  bash "$APP_DIR/deploy/merge-ssl-nginx.sh" || true
fi

echo ""
echo "--- Listeners ---"
ss -tlnp | grep -E ':80|:443' || true

echo ""
echo "--- Test ---"
curl -sfI --max-time 5 "https://$DOMAIN/" | head -3 || echo "HTTPS not responding yet"
echo "Done. Open https://$DOMAIN/"
