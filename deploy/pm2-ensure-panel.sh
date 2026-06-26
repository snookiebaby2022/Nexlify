#!/usr/bin/env bash
# Canonical panel PM2 start/restart + health verify (prevents nginx 502).
# Usage:
#   bash /var/www/nexlify/deploy/pm2-ensure-panel.sh
#   REBUILD=1 bash .../pm2-ensure-panel.sh   # rebuild .next if missing or forced
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"
PANEL_PORT="${PANEL_PORT:-3000}"
REBUILD="${REBUILD:-0}"

if [ -f "$APP_DIR/.env" ]; then
  _pd="$(grep -E '^PANEL_DIR=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)"
  [ -n "$_pd" ] && PANEL_DIR="$_pd"
fi

echo "=== pm2-ensure-panel (:${PANEL_PORT}) ==="

if [ ! -d "$PANEL_DIR" ] || [ ! -f "$PANEL_DIR/package.json" ]; then
  echo "ERROR: panel not found at $PANEL_DIR" >&2
  exit 1
fi

cd "$PANEL_DIR"
sed -i 's/\r$//' scripts/*.sh .env 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

APP_DIR="${APP_DIR:-/var/www/nexlify}"
if [ -f "$APP_DIR/deploy/fix-panel-env-quotes.sh" ]; then
  bash "$APP_DIR/deploy/fix-panel-env-quotes.sh"
fi

# Minimal env for production panel behind nginx
touch .env
set_kv() {
  local k="$1" v="$2"
  grep -q "^${k}=" .env 2>/dev/null && sed -i "s|^${k}=.*|${k}=${v}|" .env || echo "${k}=${v}" >> .env
}
set_kv PORT "${PANEL_PORT}"
set_kv PANEL_PORT "${PANEL_PORT}"
set_kv PANEL_BEHIND_NGINX 1
set_kv PANEL_BIND_HOST 127.0.0.1

if [ "$REBUILD" = "1" ] || [ ! -d .next ]; then
  echo "Building panel..."
  npm run build
fi

if [ -f scripts/pm2-start.sh ]; then
  ./scripts/pm2-start.sh
else
  pm2 restart nexlify --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --only nexlify --update-env
  pm2 save
fi

# Boot on reboot (idempotent)
if [ "$(id -u)" -eq 0 ] && [ -f scripts/pm2-boot-enable.sh ]; then
  ./scripts/pm2-boot-enable.sh 2>/dev/null || true
fi

if [ -f scripts/verify-panel-upstream.sh ]; then
  ./scripts/verify-panel-upstream.sh
else
  for i in 1 2 3 4 5; do
    if curl -fsS "http://127.0.0.1:${PANEL_PORT}/api/health" >/dev/null 2>&1; then
      echo "Panel OK on :${PANEL_PORT}"
      exit 0
    fi
    sleep 2
  done
  echo "ERROR: panel not healthy on :${PANEL_PORT}" >&2
  pm2 logs nexlify --lines 20 --nostream 2>/dev/null || true
  exit 1
fi

echo "pm2-ensure-panel done."
