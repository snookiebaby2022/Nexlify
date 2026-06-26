#!/bin/bash
# Fix redirect loops when Cloudflare proxy (orange cloud) is ON
#   bash /var/www/nexlify/deploy/fix-cloudflare.sh
set -euo pipefail

APP_DIR="/var/www/nexlify"
CONF="/etc/nginx/sites-available/nexlify.live"

echo "=== Cloudflare fix ==="
echo "Set Cloudflare SSL/TLS to: Full (strict)  (Dashboard -> SSL/TLS -> Overview)"
echo ""

[ -f "$CONF" ] && cp "$CONF" "${CONF}.bak.$(date +%s)"

cp "$APP_DIR/deploy/nginx-nexlify.conf" "$CONF"
ln -sf "$CONF" /etc/nginx/sites-enabled/nexlify.live

# Re-apply certbot HTTPS if certificates already exist
if [ -d /etc/letsencrypt/live/nexlify.live ]; then
  echo "Re-installing nginx SSL from existing cert..."
  certbot --nginx -d nexlify.live --non-interactive --redirect 2>/dev/null || \
    certbot --nginx -d nexlify.live --non-interactive
fi

nginx -t
systemctl reload nginx

echo ""
echo "Origin test (simulates Cloudflare Flexible on port 80):"
curl -sI -H "Host: nexlify.live" -H "X-Forwarded-Proto: https" http://127.0.0.1/ | head -3 || true

echo ""
echo "Purge Cloudflare: Caching -> Purge Everything"
echo "Done."
