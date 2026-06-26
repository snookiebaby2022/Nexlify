#!/bin/bash
# After certbot renew — restore full proxy config (prevents 502)
set -euo pipefail
APP_DIR="/var/www/nexlify"
CERT="/etc/letsencrypt/live/nexlify.live/fullchain.pem"

[ -f "$CERT" ] && [ -f "$APP_DIR/deploy/nginx-nexlify-production.conf" ] && \
  cp "$APP_DIR/deploy/nginx-nexlify-production.conf" /etc/nginx/sites-available/nexlify.live

[ -f /etc/letsencrypt/live/panel.nexlify.live/fullchain.pem ] && \
  [ -f "$APP_DIR/deploy/nginx-panel.nexlify.live.conf" ] && \
  cp "$APP_DIR/deploy/nginx-panel.nexlify.live.conf" /etc/nginx/sites-available/panel.nexlify.live

[ -f /etc/letsencrypt/live/panel.demo.nexlify.live/fullchain.pem ] && \
  [ -f "$APP_DIR/deploy/nginx-panel.demo.nexlify.live.conf" ] && \
  cp "$APP_DIR/deploy/nginx-panel.demo.nexlify.live.conf" /etc/nginx/sites-available/panel.demo.nexlify.live

[ -f /etc/letsencrypt/live/billing.nexlify.live/fullchain.pem ] && \
  [ -f "$APP_DIR/deploy/nginx-billing.nexlify.live.conf" ] && \
  cp "$APP_DIR/deploy/nginx-billing.nexlify.live.conf" /etc/nginx/sites-available/billing.nexlify.live

nginx -t && systemctl reload nginx
