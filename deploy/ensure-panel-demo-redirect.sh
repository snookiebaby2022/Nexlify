#!/bin/bash
# panel.demo.nexlify.live — origin SSL + redirect (same durability as panel.nexlify.live)
set -euo pipefail

APP_DIR="/var/www/nexlify"
DEMO_DOMAIN="panel.demo.nexlify.live"
DEMO_CONF="/etc/nginx/sites-available/panel.demo.nexlify.live"
DEMO_CERT="/etc/letsencrypt/live/$DEMO_DOMAIN/fullchain.pem"

echo "=== ensure-panel-demo-redirect ($DEMO_DOMAIN) ==="

command -v nginx >/dev/null || { echo "nginx missing"; exit 1; }

if [ ! -f "$DEMO_CERT" ]; then
  echo "Requesting certificate for $DEMO_DOMAIN..."
  command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx
  # Temp HTTP vhost so certbot can answer (no HTTPS block without cert yet)
  cat > "$DEMO_CONF" <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name panel.demo.nexlify.live;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://panel.nexlify.live/login; }
}
NGINX
  ln -sf "$DEMO_CONF" /etc/nginx/sites-enabled/panel.demo.nexlify.live
  nginx -t && systemctl reload nginx

  certbot certonly --nginx -d "$DEMO_DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email || \
  certbot --nginx -d "$DEMO_DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
fi

if [ ! -f "$DEMO_CERT" ]; then
  echo "FAIL: no cert at $DEMO_CERT"
  echo "  Cloudflare DNS: panel.demo A -> this server (proxied OK for HTTP-01 if origin :80 reachable)"
  exit 1
fi

cp "$APP_DIR/deploy/nginx-panel.demo.nexlify.live.conf" "$DEMO_CONF"
ln -sf "$DEMO_CONF" /etc/nginx/sites-enabled/panel.demo.nexlify.live

nginx -t
systemctl reload nginx

echo "Origin TLS for demo panel:"
openssl s_client -connect 127.0.0.1:443 -servername "$DEMO_DOMAIN" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject 2>/dev/null || echo "FAIL (wrong cert = Cloudflare 526)"

echo "Redirect check:"
curl -sI --max-time 8 "https://127.0.0.1/" -k -H "Host: $DEMO_DOMAIN" | grep -iE 'HTTP/|location:' || true
echo "Cloudflare: SSL/TLS -> Full (strict); DNS panel.demo -> VPS; Purge cache"
echo "ensure-panel-demo-redirect done."
