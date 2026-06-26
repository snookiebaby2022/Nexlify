#!/bin/bash
# billing.nexlify.live — WHMCS origin SSL (fixes Cloudflare 526)
set -euo pipefail

APP_DIR="/var/www/nexlify"
BILLING_DOMAIN="billing.nexlify.live"
BILLING_ROOT="/var/www/whmcs"
BILLING_CONF="/etc/nginx/sites-available/billing.nexlify.live"
BILLING_CERT="/etc/letsencrypt/live/$BILLING_DOMAIN/fullchain.pem"
PHP_SOCK="/run/php/php8.3-fpm.sock"

echo "=== ensure-billing-ssl ($BILLING_DOMAIN) ==="

command -v nginx >/dev/null || { echo "nginx missing"; exit 1; }

if [ ! -d "$BILLING_ROOT" ]; then
  echo "Creating $BILLING_ROOT (upload WHMCS files here)"
  mkdir -p "$BILLING_ROOT"
  chown www-data:www-data "$BILLING_ROOT"
fi

if [ ! -S "$PHP_SOCK" ]; then
  apt-get update -qq
  apt-get install -y php8.3-fpm php-mysql php-cli php-curl php-gd php-mbstring php-xml php-zip php-intl php-bcmath
  systemctl enable --now php8.3-fpm
fi

bash "$APP_DIR/deploy/ensure-ioncube.sh" 2>/dev/null || true
bash "$APP_DIR/deploy/ensure-whmcs-permissions.sh" 2>/dev/null || true
bash "$APP_DIR/deploy/ensure-whmcs-hardening.sh" 2>/dev/null || true
bash "$APP_DIR/deploy/ensure-whmcs-csrf-fix.sh" 2>/dev/null || true

if [ ! -f "$BILLING_CERT" ]; then
  echo "Requesting certificate for $BILLING_DOMAIN..."
  command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx
  cat > "$BILLING_CONF" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $BILLING_DOMAIN;
    root $BILLING_ROOT;
    index index.php;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { try_files \$uri \$uri/ /index.php?\$query_string; }
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:$PHP_SOCK;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
    }
}
NGINX
  ln -sf "$BILLING_CONF" /etc/nginx/sites-enabled/billing.nexlify.live
  nginx -t && systemctl reload nginx

  certbot certonly --nginx -d "$BILLING_DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email || \
  certbot --nginx -d "$BILLING_DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
fi

if [ ! -f "$BILLING_CERT" ]; then
  echo "FAIL: no cert at $BILLING_CERT"
  echo "  DNS: billing A -> this server; Cloudflare proxy OK if port 80 reaches origin"
  exit 1
fi

cp "$APP_DIR/deploy/nginx-billing.nexlify.live.conf" "$BILLING_CONF"
ln -sf "$BILLING_CONF" /etc/nginx/sites-enabled/billing.nexlify.live

chown -R www-data:www-data "$BILLING_ROOT" 2>/dev/null || true

nginx -t
systemctl reload nginx

echo "Origin TLS for billing:"
openssl s_client -connect 127.0.0.1:443 -servername "$BILLING_DOMAIN" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject 2>/dev/null || echo "FAIL (526 at Cloudflare)"

curl -sI --max-time 8 -k -H "Host: $BILLING_DOMAIN" "https://127.0.0.1/" | grep -iE 'HTTP/|location:' || true
echo "Cloudflare: SSL/TLS -> Full (strict); Purge cache"
echo "ensure-billing-ssl done."
