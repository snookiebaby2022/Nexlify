#!/bin/bash
# Permanent fix: website :3001 + panel :3000 + nginx HTTPS (502 / 526)
#   bash /var/www/nexlify/deploy/ensure-site.sh
set -euo pipefail

APP_DIR="/var/www/nexlify"
DOMAIN="nexlify.live"
CONF="/etc/nginx/sites-available/nexlify.live"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

echo "=== ensure-site (website + panel + demo paths) ==="

# Load panel path from website .env if set
if [ -f "$APP_DIR/.env" ]; then
  # shellcheck disable=SC1090
  PANEL_DIR="$(grep -E '^PANEL_DIR=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)"
  export PANEL_DIR
fi

bash "$APP_DIR/deploy/ensure-security-hardening.sh" || echo "WARN: security hardening partial"
bash "$APP_DIR/deploy/ensure-app.sh"
bash "$APP_DIR/deploy/ensure-panel.sh" || echo "WARN: panel step failed — check PANEL_DIR"

command -v nginx >/dev/null || { echo "nginx missing"; exit 1; }

mkdir -p /etc/nginx/conf.d
cp "$APP_DIR/deploy/nginx-upstream.conf" /etc/nginx/conf.d/nexlify-upstream.conf

if [ -f "$CERT" ] && [ -f "$APP_DIR/deploy/nginx-nexlify-production.conf" ]; then
  cp "$APP_DIR/deploy/nginx-nexlify-production.conf" "$CONF"
else
  cp "$APP_DIR/deploy/nginx-nexlify.conf" "$CONF"
fi

ln -sf "$CONF" /etc/nginx/sites-enabled/nexlify.live
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

if [ ! -f "$CERT" ]; then
  bash "$APP_DIR/deploy/ensure-ssl.sh"
else
  nginx -t && systemctl reload nginx
  HOOK_DIR="/etc/letsencrypt/renewal-hooks/deploy"
  mkdir -p "$HOOK_DIR"
  install -m 755 "$APP_DIR/deploy/certbot-renew-hook.sh" "$HOOK_DIR/nexlify-nginx.sh"
fi

# IPTV panel + panel.demo hostnames (origin certs, 526-safe; demo → /login)
bash "$APP_DIR/deploy/ensure-panel-ssl.sh"

# WHMCS billing subdomain (526-safe)
bash "$APP_DIR/deploy/ensure-billing-ssl.sh" || echo "WARN: billing SSL failed — check /var/www/whmcs"

echo ""
echo "--- Health ---"
curl -sI --max-time 5 http://127.0.0.1:3001 | head -1 || echo "website :3001 FAIL"
curl -sI --max-time 5 http://127.0.0.1:3000 | head -1 || echo "panel :3000 FAIL"
curl -sI --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1/ | head -1 || true
curl -sI --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1/panel/ | head -1 || true
curl -sI --max-time 8 "https://127.0.0.1/" -k -H "Host: $DOMAIN" | head -1 || true
curl -sI --max-time 8 "https://127.0.0.1/panel/" -k -H "Host: $DOMAIN" | head -1 || true

echo ""
echo "Public URLs:"
echo "  Website:  https://nexlify.live/"
echo "  Demo:     https://nexlify.live/demo"
echo "  Demo panel: https://panel.demo.nexlify.live/ (sandbox — read-only)"
echo "  Panel:    https://nexlify.live/panel/"
echo "  WHMCS:    https://billing.nexlify.live/"
echo "Cloudflare: Full (strict) + Purge cache"
