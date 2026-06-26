#!/bin/bash
# Idempotent SSL repair — run after every deploy (fixes Cloudflare 526)
#   bash /var/www/nexlify/deploy/ensure-ssl.sh
set -euo pipefail

APP_DIR="/var/www/nexlify"
DOMAIN="nexlify.live"
CONF="/etc/nginx/sites-available/nexlify.live"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

echo "=== ensure-ssl ($DOMAIN) ==="

command -v nginx >/dev/null || { echo "nginx missing"; exit 1; }

# Always refresh Cloudflare-safe HTTP config
cp "$APP_DIR/deploy/nginx-nexlify.conf" "$CONF"
ln -sf "$CONF" /etc/nginx/sites-enabled/nexlify.live
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl reload nginx

# App must respond before certbot/nginx SSL tests matter
if ! curl -sfI --max-time 5 http://127.0.0.1:3001 | head -1 | grep -qE '200|301|302'; then
  echo "WARN: nexlify not on 3001 — pm2 restart nexlify"
  export NEXLIFY_DIR="$APP_DIR"
  pm2 restart nexlify-web 2>/dev/null || pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
  sleep 2
fi

if ! command -v certbot &>/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y certbot python3-certbot-nginx
fi

ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true

if [ -d "$CERT_DIR" ]; then
  echo "Certificate found — attaching to nginx..."
  certbot install --cert-name "$DOMAIN" --nginx 2>/dev/null || \
    certbot --nginx -d "$DOMAIN" --non-interactive --redirect 2>/dev/null || \
    certbot --nginx -d "$DOMAIN" --non-interactive
else
  echo "No certificate — requesting new one..."
  certbot --nginx -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    --redirect
fi

# Prefer full production config (both :80 and :443 proxy) when cert exists
if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$APP_DIR/deploy/nginx-nexlify-production.conf" ]; then
  cp "$APP_DIR/deploy/nginx-nexlify-production.conf" "$CONF"
elif grep -q "listen 443" "$CONF" && ! grep -q "proxy_pass http://nexlify_app" "$CONF"; then
  echo "SSL block missing proxy — merging..."
  bash "$APP_DIR/deploy/merge-ssl-nginx.sh"
fi

nginx -t
systemctl reload nginx

# Install renewal hook so renewals keep proxy rules
HOOK_DIR="/etc/letsencrypt/renewal-hooks/deploy"
mkdir -p "$HOOK_DIR"
install -m 755 "$APP_DIR/deploy/certbot-renew-hook.sh" "$HOOK_DIR/nexlify-nginx.sh"

echo ""
ss -tlnp | grep -E ':80|:443' || true
echo "Origin HTTPS:"
curl -sI --max-time 8 "https://127.0.0.1/" -k -H "Host: $DOMAIN" | head -3 || echo "FAIL"
echo ""
echo "Cloudflare: SSL/TLS -> Full (strict), then Purge Everything"
echo "ensure-ssl done."
