#!/bin/bash
# IPTV panel on 127.0.0.1:3000 + demo at /panel/ (fixes panel 502)
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"
PANEL_PORT="${PANEL_PORT:-3000}"

echo "=== ensure-panel (:${PANEL_PORT}) ==="

if [ ! -d "$PANEL_DIR" ] || [ ! -f "$PANEL_DIR/package.json" ]; then
  echo "WARN: panel not found at $PANEL_DIR — set PANEL_DIR in /var/www/nexlify/.env"
  echo "Skipping panel (website /demo still works if nexlify-web is up)"
  exit 0
fi

cd "$PANEL_DIR"
sed -i 's/\r$//' scripts/*.sh .env 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

touch .env
set_kv() {
  local k="$1" v="$2"
  grep -q "^${k}=" .env 2>/dev/null && sed -i "s|^${k}=.*|${k}=${v}|" .env || echo "${k}=${v}" >> .env
}
set_kv PORT "${PANEL_PORT}"
set_kv PANEL_PORT "${PANEL_PORT}"
set_kv WEBSITE_PORT 3001
set_kv STREAM_EDGE_PORT 8080
set_kv STREAM_HTTP_PORT 8080
set_kv PANEL_BEHIND_NGINX 1
set_kv PANEL_BIND_HOST 127.0.0.1
set_kv PANEL_PRIMARY_DOMAIN panel.nexlify.live
set_kv PANEL_ASSUME_PROXY_SSL 1
set_kv NEXT_PUBLIC_SERVER_URL "https://nexlify.live/panel"
set_kv NEXT_PUBLIC_WEBSITE_URL "https://nexlify.live"

# nginx must not bind :3000 — only Node panel does
for f in /etc/nginx/sites-enabled/*; do
  [ -f "$f" ] || continue
  if grep -q 'listen.*3000' "$f" 2>/dev/null && ! grep -q '127.0.0.1:3000' "$f" 2>/dev/null; then
    echo "Disabling nginx on :3000: $f"
    mv "$f" "${f}.disabled-by-ensure-panel" 2>/dev/null || true
  fi
done

if [ ! -d .next ]; then
  echo "Building panel..."
  npm ci
  npm run build
fi

if [ -f scripts/pm2-start.sh ]; then
  ./scripts/pm2-start.sh
else
  pm2 delete nexlify 2>/dev/null || true
  pm2 start ecosystem.config.cjs --only nexlify --update-env
  pm2 save
fi

# PM2 boot on reboot + cron watchdog (502 self-heal)
if [ "$(id -u)" -eq 0 ] && [ -f scripts/pm2-boot-enable.sh ]; then
  ./scripts/pm2-boot-enable.sh 2>/dev/null || true
fi
APP_DIR="${APP_DIR:-/var/www/nexlify}"
if [ -f "$APP_DIR/deploy/install-panel-watchdog.sh" ]; then
  bash "$APP_DIR/deploy/install-panel-watchdog.sh" 2>/dev/null || true
fi

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:${PANEL_PORT}/api/health" >/dev/null 2>&1; then
    echo "Panel OK on :${PANEL_PORT}"
    exit 0
  fi
  echo "Waiting for panel ($i/10)..."
  sleep 2
done

echo "FAIL: panel not healthy on :${PANEL_PORT}"
pm2 logs nexlify --lines 30 --nostream 2>/dev/null || true
exit 1
