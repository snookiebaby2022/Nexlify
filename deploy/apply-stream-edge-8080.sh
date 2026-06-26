#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-stream-edge-8080 ==="

# nginx stream edge :8080
cp "$APP_DIR/deploy/nginx-stream-edge-8080.conf" /etc/nginx/conf.d/nexlify-stream-edge.conf
nginx -t
systemctl reload nginx

# Panel env — keep website :3001, stream edge :8080
if [ -d "$PANEL_DIR" ] && [ -f "$PANEL_DIR/.env" ]; then
  set_kv() {
    local k="$1" v="$2"
    grep -q "^${k}=" "$PANEL_DIR/.env" 2>/dev/null && \
      sed -i "s|^${k}=.*|${k}=${v}|" "$PANEL_DIR/.env" || \
      echo "${k}=${v}" >> "$PANEL_DIR/.env"
  }
  set_kv STREAM_EDGE_PORT 8080
  set_kv STREAM_HTTP_PORT 8080
  set_kv WEBSITE_PORT 3001

  PP="$APP_DIR/deploy/panel-patches"
  for f in server-ports.ts xtream.ts public-origin.ts panel-server.ts panel-settings.ts; do
    if [ -f "$PP/$f" ]; then
      cp "$PP/$f" "$PANEL_DIR/src/lib/$f"
    fi
  done

  cd "$PANEL_DIR"
  npm run build
  pm2 restart nexlify --update-env 2>/dev/null || true
fi

# Open firewall if ufw is active
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 8080/tcp comment 'Nexlify stream edge HTTP' 2>/dev/null || true
fi

echo "Stream edge :8080 active. Test:"
echo "  curl -sI http://127.0.0.1:8080/player_api.php | head -1"
echo "Clients: http://panel.nexlify.live:8080 (or your server IP:8080)"
