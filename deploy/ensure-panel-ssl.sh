#!/bin/bash
# Permanent SSL for panel.nexlify.live (fixes Cloudflare 526 on IPTV panel)
set -euo pipefail

APP_DIR="/var/www/nexlify"
PANEL_DOMAIN="panel.nexlify.live"
PANEL_CONF="/etc/nginx/sites-available/panel.nexlify.live"
PANEL_CERT="/etc/letsencrypt/live/$PANEL_DOMAIN/fullchain.pem"

echo "=== ensure-panel-ssl ($PANEL_DOMAIN) ==="

command -v nginx >/dev/null || { echo "nginx missing"; exit 1; }

mkdir -p /etc/nginx/conf.d
cp "$APP_DIR/deploy/nginx-upstream.conf" /etc/nginx/conf.d/nexlify-upstream.conf

# Panel must be listening before nginx health matters
bash "$APP_DIR/deploy/ensure-panel.sh" || true

if [ ! -f "$PANEL_CERT" ]; then
  echo "Requesting certificate for $PANEL_DOMAIN..."
  command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx
  certbot certonly --nginx -d "$PANEL_DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email || \
  certbot --nginx -d "$PANEL_DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
fi

if [ ! -f "$PANEL_CERT" ]; then
  echo "FAIL: no cert at $PANEL_CERT — add DNS A record for $PANEL_DOMAIN -> this server"
  exit 1
fi

cp "$APP_DIR/deploy/nginx-panel.nexlify.live.conf" "$PANEL_CONF"
ln -sf "$PANEL_CONF" /etc/nginx/sites-enabled/panel.nexlify.live

nginx -t
systemctl reload nginx

echo "Origin TLS for panel:"
openssl s_client -connect 127.0.0.1:443 -servername "$PANEL_DOMAIN" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject 2>/dev/null || echo "FAIL (wrong cert = Cloudflare 526)"

curl -sI --max-time 5 "https://127.0.0.1/" -k -H "Host: $PANEL_DOMAIN" | head -3
echo "Cloudflare: SSL/TLS -> Full (strict), Purge cache"
bash "$APP_DIR/deploy/ensure-security-env.sh" || true
bash "$APP_DIR/deploy/ensure-panel-staging-access.sh" || true
echo "Owner staging: https://panel.nexlify.live/login (see deploy/PANEL-STAGING.md)"
# Demo marketing hostname (panel.demo.nexlify.live)
bash "$APP_DIR/deploy/ensure-panel-demo-live.sh"

echo "ensure-panel-ssl done."
