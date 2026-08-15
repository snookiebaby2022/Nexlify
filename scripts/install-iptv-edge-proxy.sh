#!/usr/bin/env bash
# Install Host-sanitizing IPTV edge proxy on :443 / extra HTTP ports.
# nginx rejects Host: http://IP with 400 — XCIPTV often pastes schemes into DNS.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
[ -f "$PANEL_DIR/package.json" ] || PANEL_DIR="/home/nexlify-panel"
cd "$PANEL_DIR"

ENV_FILE="$PANEL_DIR/.env"
env_val() {
  local key="$1"
  [ -f "$ENV_FILE" ] || { echo ""; return 0; }
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

PANEL_LISTEN="$(env_val PORT)"
[ -z "$PANEL_LISTEN" ] && PANEL_LISTEN="$(env_val PANEL_PORT)"
[ -z "$PANEL_LISTEN" ] && PANEL_LISTEN="80"

# Ensure TLS material exists (self-signed IP cert OK for IPTV apps).
bash "$PANEL_DIR/scripts/fix-panel-https-default.sh" --certs-only

CERT="/etc/nginx/ssl/nexlify-panel/fullchain.pem"
KEY="/etc/nginx/ssl/nexlify-panel/privkey.pem"
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "[iptv-edge] ERROR: TLS cert missing after fix-panel-https-default.sh --certs-only"
  exit 1
fi

# Free ports from nginx so Node can bind (keep nginx for other vhosts if any).
rm -f /etc/nginx/conf.d/nexlify-panel-ssl.conf
rm -f /etc/nginx/conf.d/nexlify-stream-extra.conf
rm -f /etc/nginx/conf.d/nexlify-https-extra.conf
if command -v nginx >/dev/null 2>&1; then
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
fi

# Extra HTTP IPTV ports from env (same defaults as stream-edge).
HTTP_PORTS="$(env_val STREAM_HTTP_EXTRA_PORTS)"
[ -z "$HTTP_PORTS" ] && HTTP_PORTS="$(env_val PANEL_HTTP_EXTRA_PORTS)"
[ -z "$HTTP_PORTS" ] && HTTP_PORTS="8080,25461"
HTTPS_PORTS="$(env_val STREAM_HTTPS_PORT)"
[ -z "$HTTPS_PORTS" ] && HTTPS_PORTS="$(env_val PANEL_SSL_PORT)"
[ -z "$HTTPS_PORTS" ] && HTTPS_PORTS="443"

# Vendor / multi-vhost hosts: nginx must own :443 (nexlify.live + panel.nexlify.live).
# Never steal 443 when marketing or named SSL vhosts are present.
if [ -d /var/www/nexlify ] || [ -f /etc/nginx/sites-enabled/nexlify.live ] || [ -f /etc/nginx/sites-enabled/panel.nexlify.live ]; then
  echo "[iptv-edge] Vendor/marketing host detected — leaving :443 to nginx (Let's Encrypt vhosts)"
  HTTPS_PORTS=""
  # Restore disk-backed release + installer locations if a previous run removed ssl conf only;
  # do not install nexlify-panel-ssl.conf default_server here (would steal SNI).
  rm -f /etc/nginx/conf.d/nexlify-panel-ssl.conf
fi

export IPTV_EDGE_BACKEND="127.0.0.1:${PANEL_LISTEN}"
export IPTV_EDGE_HTTP_PORTS="$HTTP_PORTS"
export IPTV_EDGE_HTTPS_PORTS="$HTTPS_PORTS"
export IPTV_EDGE_CERT="$CERT"
export IPTV_EDGE_KEY="$KEY"

# Wait briefly for previous listeners to release sockets
sleep 1
# Only free ports we will bind (never kill nginx :443 on vendor)
for p in $(echo "$HTTP_PORTS" | tr ',' ' '); do
  fuser -k "${p}/tcp" 2>/dev/null || true
done
if [ -n "$HTTPS_PORTS" ]; then
  for p in $(echo "$HTTPS_PORTS" | tr ',' ' '); do
    fuser -k "${p}/tcp" 2>/dev/null || true
  done
fi
sleep 1

if command -v nginx >/dev/null 2>&1; then
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || systemctl start nginx 2>/dev/null || true
fi

if [ -z "$HTTP_PORTS" ] && [ -z "$HTTPS_PORTS" ]; then
  echo "[iptv-edge] Nothing to bind — skipping proxy"
  pm2 delete nexlify-iptv-edge 2>/dev/null || true
  exit 0
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete nexlify-iptv-edge 2>/dev/null || true
  pm2 start "$PANEL_DIR/scripts/iptv-edge-proxy.mjs" \
    --name nexlify-iptv-edge \
    --cwd "$PANEL_DIR" \
    --interpreter node \
    --update-env
  pm2 save 2>/dev/null || true
else
  echo "[iptv-edge] WARN: pm2 not found — starting in background"
  nohup node "$PANEL_DIR/scripts/iptv-edge-proxy.mjs" >>/var/log/nexlify-iptv-edge.log 2>&1 &
fi

sleep 1
ss -tlnp | grep -E ':443\b|:8080\b|:25461\b' || echo "[iptv-edge] WARN: expected ports not listening yet"
echo "[iptv-edge] OK backend=${IPTV_EDGE_BACKEND} http=${HTTP_PORTS:-none} https=${HTTPS_PORTS:-none}"
