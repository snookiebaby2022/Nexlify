#!/usr/bin/env bash
# Install Host-sanitizing IPTV edge proxy on :443 / extra HTTP ports.
# nginx rejects Host: http://IP with 400 — XCIPTV often pastes schemes into DNS.
#
# Port ownership (cannot share a TCP port with nginx):
#   IPTV edge → STREAM_HTTP_EXTRA (default 8080,25461) + optional :443 on IP panels
#   nginx     → :80 (panel UI) + marketing/Let's Encrypt :443 when present
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
# IP panels: Node on 13000, edge on :80 — never default to 80 for the backend target.
[ -z "$PANEL_LISTEN" ] && PANEL_LISTEN="13000"

# Ensure TLS material exists (self-signed IP cert OK for IPTV apps).
bash "$PANEL_DIR/scripts/fix-panel-https-default.sh" --certs-only

CERT="/etc/nginx/ssl/nexlify-panel/fullchain.pem"
KEY="/etc/nginx/ssl/nexlify-panel/privkey.pem"
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "[iptv-edge] ERROR: TLS cert missing after fix-panel-https-default.sh --certs-only"
  exit 1
fi

# Extra HTTP IPTV ports from env (same defaults as stream-edge).
HTTP_PORTS="$(env_val STREAM_HTTP_EXTRA_PORTS)"
[ -z "$HTTP_PORTS" ] && HTTP_PORTS="$(env_val PANEL_HTTP_EXTRA_PORTS)"
[ -z "$HTTP_PORTS" ] && HTTP_PORTS="8080,25461"

# IP panels: Node listens on 13000; edge must own public :80 (XUI-style stream splice).
STREAM_PUBLIC="$(env_val STREAM_HTTP_PORT)"
if [ "$PANEL_LISTEN" != "80" ] && [ "$STREAM_PUBLIC" = "80" ]; then
  HTTP_PORTS="80,${HTTP_PORTS}"
fi
HTTPS_PORTS="$(env_val STREAM_HTTPS_PORT)"
[ -z "$HTTPS_PORTS" ] && HTTPS_PORTS="$(env_val PANEL_SSL_PORT)"
[ -z "$HTTPS_PORTS" ] && HTTPS_PORTS="443"

# Hosts where nginx must own :443 (marketing TLS, MovieFlix/FlixNova, other LE sites).
# Never steal 443 when those vhosts are present — IPTV edge keeps :8080/:25461 only.
if [ -d /var/www/nexlify ] \
  || [ -d /var/www/moviestream ] \
  || [ -f /etc/nginx/sites-enabled/nexlify.live ] \
  || [ -f /etc/nginx/sites-enabled/panel.nexlify.live ] \
  || [ -f /etc/nginx/sites-enabled/moviestream ] \
  || [ -f /etc/nginx/sites-available/moviestream ] \
  || [ -d /etc/letsencrypt/live/snookiebaby.xyz ]; then
  echo "[iptv-edge] Multi-vhost / MovieFlix / marketing host — leaving :443 to nginx (Let's Encrypt)"
  HTTPS_PORTS=""
  # Restore disk-backed release + installer locations if a previous run removed ssl conf only;
  # do not install nexlify-panel-ssl.conf default_server here (would steal SNI).
  rm -f /etc/nginx/conf.d/nexlify-panel-ssl.conf
fi

RELEASE_PORTS="$(echo "$HTTP_PORTS $HTTPS_PORTS" | tr ',' ' ' | xargs)"

# Strip nginx listen directives for edge-owned ports BEFORE killing sockets.
# Otherwise a later nginx restart tries to re-bind 8080 and takes down :80 too.
if [ -n "$RELEASE_PORTS" ] && [ -f "$PANEL_DIR/scripts/nexlify-nginx-release-ports.sh" ]; then
  # shellcheck disable=SC2086
  bash "$PANEL_DIR/scripts/nexlify-nginx-release-ports.sh" $RELEASE_PORTS || true
else
  rm -f /etc/nginx/conf.d/nexlify-panel-ssl.conf
  rm -f /etc/nginx/conf.d/nexlify-stream-extra.conf
  rm -f /etc/nginx/conf.d/nexlify-https-extra.conf
  rm -f /etc/nginx/conf.d/nexlify-stream-edge.conf
  if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || systemctl start nginx 2>/dev/null || true
  fi
fi

export IPTV_EDGE_BACKEND="127.0.0.1:${PANEL_LISTEN}"
export IPTV_EDGE_HTTP_PORTS="$HTTP_PORTS"
export IPTV_EDGE_HTTPS_PORTS="$HTTPS_PORTS"
export IPTV_EDGE_CERT="$CERT"
export IPTV_EDGE_KEY="$KEY"

# Wait briefly for previous listeners to release sockets
sleep 1
# Only free ports we will bind (do not kill :80 while the panel Node still owns it).
for p in $(echo "$HTTP_PORTS" | tr ',' ' '); do
  [ -z "$p" ] && continue
  if [ "$p" = "80" ] && [ "$PANEL_LISTEN" = "80" ]; then
    continue
  fi
  fuser -k "${p}/tcp" 2>/dev/null || true
done
if [ -n "$HTTPS_PORTS" ]; then
  for p in $(echo "$HTTPS_PORTS" | tr ',' ' '); do
    [ -z "$p" ] && continue
    [ "$p" = "80" ] && continue
    fuser -k "${p}/tcp" 2>/dev/null || true
  done
fi
sleep 1

# nginx must stay healthy on remaining ports (:80) after we took 8080/443
if command -v nginx >/dev/null 2>&1; then
  if nginx -t 2>/dev/null; then
    if systemctl is-active --quiet nginx 2>/dev/null; then
      systemctl reload nginx 2>/dev/null || true
    else
      systemctl start nginx 2>/dev/null || true
    fi
  else
    echo "[iptv-edge] WARN: nginx -t failed — not restarting nginx blindly" >&2
  fi
fi

if [ -z "$HTTP_PORTS" ] && [ -z "$HTTPS_PORTS" ]; then
  echo "[iptv-edge] Nothing to bind — skipping proxy"
  pm2 delete nexlify-iptv-edge 2>/dev/null || true
  exit 0
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete nexlify-iptv-edge 2>/dev/null || true
  set -a
  # shellcheck disable=SC1091
  [ -f "$PANEL_DIR/.env" ] && . "$PANEL_DIR/.env"
  set +a
  export PANEL_INTERNAL_SECRET="${PANEL_INTERNAL_SECRET:-$(env_val PANEL_API_SECRET)}"
  export PANEL_API_SECRET="${PANEL_API_SECRET:-$PANEL_INTERNAL_SECRET}"
  export NEXLIFY_PANEL_API_SECRET="${NEXLIFY_PANEL_API_SECRET:-$PANEL_INTERNAL_SECRET}"
  if [ -x "$PANEL_DIR/scripts/wait-panel-ready.sh" ]; then
    echo "[iptv-edge] waiting for panel on 127.0.0.1:${PANEL_LISTEN} before starting edge..."
    bash "$PANEL_DIR/scripts/wait-panel-ready.sh" || {
      echo "[iptv-edge] ERROR: panel not ready — refusing to start edge (would 502 on :80)" >&2
      exit 1
    }
  fi
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
# Confirm nginx survived (panel UI on :80)
if command -v nginx >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx 2>/dev/null; then
    echo "[iptv-edge] nginx still active (panel HTTP intact)"
  else
    echo "[iptv-edge] WARN: nginx inactive after edge start — attempting start" >&2
    systemctl start nginx 2>/dev/null || true
  fi
fi
echo "[iptv-edge] OK backend=${IPTV_EDGE_BACKEND} http=${HTTP_PORTS:-none} https=${HTTPS_PORTS:-none}"
