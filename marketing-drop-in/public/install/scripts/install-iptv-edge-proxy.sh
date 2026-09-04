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

# Never bind/kill :8080 or start local edge on the customer panel (502 live loop).
# shellcheck disable=SC1091
if [ -f "$PANEL_DIR/scripts/panel-no-local-iptv-edge.sh" ]; then
  . "$PANEL_DIR/scripts/panel-no-local-iptv-edge.sh"
  if nexlify_panel_must_not_run_iptv_edge; then
    echo "[iptv-edge] SKIP install — nginx owns live :8080 on this panel"
    nexlify_stop_panel_local_iptv_edge
    exit 0
  fi
fi

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

nginx_owns_public_web() {
  [ -d /var/www/nexlify ] \
    || [ -d /var/www/moviestream ] \
    || [ -f /etc/nginx/sites-enabled/nexlify.live ] \
    || [ -f /etc/nginx/sites-enabled/panel.nexlify.live ] \
    || [ -f /etc/nginx/sites-enabled/moviestream ] \
    || [ -f /etc/nginx/sites-available/moviestream ] \
    || [ -d /etc/letsencrypt/live/snookiebaby.xyz ]
}

# Never bind IPTV-edge on :80. Next is on 13000; nginx must keep :80 for /admin and /login.
HTTP_PORTS="$(echo "$HTTP_PORTS" | tr ',' '\n' | grep -v '^80$' | grep -v '^$' | paste -sd, -)"
[ -z "$HTTP_PORTS" ] && HTTP_PORTS="8080,25461"
if [ "$PANEL_LISTEN" != "80" ]; then
  echo "[iptv-edge] Panel UI stays on nginx :80 (backend 127.0.0.1:${PANEL_LISTEN}); edge will not bind :80"
fi

PANEL_BEHIND="$(env_val PANEL_BEHIND_NGINX)"
PRIMARY_DOM="$(env_val PANEL_PRIMARY_DOMAIN)"

HTTPS_PORTS="$(env_val IPTV_EDGE_HTTPS_PORTS)"
[ -z "$HTTPS_PORTS" ] && HTTPS_PORTS="$(env_val STREAM_HTTPS_PORT)"
# Domain panels behind nginx: never fall back to PANEL_SSL_PORT — nginx owns :443.
if [ -z "$HTTPS_PORTS" ] && [ "$PANEL_BEHIND" != "1" ]; then
  HTTPS_PORTS="$(env_val PANEL_SSL_PORT)"
fi
[ -z "$HTTPS_PORTS" ] && [ "$PANEL_BEHIND" != "1" ] && HTTPS_PORTS="443"

if [ "$PANEL_BEHIND" = "1" ] && [ -n "$PRIMARY_DOM" ] && ! echo "$PRIMARY_DOM" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "[iptv-edge] Domain panel behind nginx — nginx owns :443, edge HTTP only (:8080/:25461)"
  HTTPS_PORTS=""
  if [ -x "$PANEL_DIR/scripts/install-nginx-panel-https.sh" ]; then
    bash "$PANEL_DIR/scripts/install-nginx-panel-https.sh" || true
  fi
fi

# Hosts where nginx must own :443 (marketing TLS, MovieFlix/FlixNova, other LE sites).
# Never steal 443 when those vhosts are present — IPTV edge keeps :8080/:25461 only.
if nginx_owns_public_web; then
  echo "[iptv-edge] Multi-vhost / MovieFlix / marketing host — leaving :443 to nginx (Let's Encrypt)"
  HTTPS_PORTS=""
  # Restore disk-backed release + installer locations if a previous run removed ssl conf only;
  # do not install nexlify-panel-ssl.conf default_server here (would steal SNI).
  rm -f /etc/nginx/conf.d/nexlify-panel-ssl.conf
fi

RELEASE_PORTS="$(echo "$HTTP_PORTS $HTTPS_PORTS" | tr ',' ' ' | xargs)"
# When nginx serves panel HTTPS, never strip :443 from nginx configs.
if [ "$PANEL_BEHIND" = "1" ] && [ -n "$PRIMARY_DOM" ] && ! echo "$PRIMARY_DOM" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  RELEASE_PORTS="$(echo "$RELEASE_PORTS" | tr ' ' '\n' | grep -vx '443' | xargs)"
fi

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

export IPTV_EDGE_BACKEND="${IPTV_EDGE_BACKEND:-$(env_val IPTV_EDGE_BACKEND)}"
if [ -z "$IPTV_EDGE_BACKEND" ]; then
  export IPTV_EDGE_BACKEND="127.0.0.1:${PANEL_LISTEN}"
fi
IPTV_EDGE_REMOTE_NODE="${IPTV_EDGE_REMOTE_NODE:-$(env_val IPTV_EDGE_REMOTE_NODE)}"
export IPTV_EDGE_HTTP_PORTS="$HTTP_PORTS"
export IPTV_EDGE_HTTPS_PORTS="$HTTPS_PORTS"
export IPTV_EDGE_CERT="$CERT"
export IPTV_EDGE_KEY="$KEY"

# Wait briefly for previous listeners to release sockets
sleep 1
# Only free ports we will bind. Never kill :80 (panel UI / MovieFlix).
for p in $(echo "$HTTP_PORTS" | tr ',' ' '); do
  [ -z "$p" ] && continue
  [ "$p" = "80" ] && continue
  [ "$p" = "8080" ] && continue
  fuser -k "${p}/tcp" 2>/dev/null || true
done
if [ -n "$HTTPS_PORTS" ]; then
  for p in $(echo "$HTTPS_PORTS" | tr ',' ' '); do
    [ -z "$p" ] && continue
    [ "$p" = "80" ] && continue
  [ "$p" = "8080" ] && continue
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

# After stripping 8080/443, restore nginx :80 → Next if this host has no other :80 vhost.
if [ "$IPTV_EDGE_REMOTE_NODE" != "1" ] && [ -x "$PANEL_DIR/scripts/install-nginx-stream-edge.sh" ]; then
  bash "$PANEL_DIR/scripts/install-nginx-stream-edge.sh" || true
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
  if [ -x "$PANEL_DIR/scripts/wait-panel-ready.sh" ] && [ "$IPTV_EDGE_REMOTE_NODE" != "1" ]; then
    echo "[iptv-edge] waiting for panel on 127.0.0.1:${PANEL_LISTEN} before starting edge..."
    bash "$PANEL_DIR/scripts/wait-panel-ready.sh" || {
      echo "[iptv-edge] ERROR: panel not ready — refusing to start edge (would 502 on :80)" >&2
      exit 1
    }
  elif [ "$IPTV_EDGE_REMOTE_NODE" = "1" ]; then
    REMOTE_HEALTH="http://${IPTV_EDGE_BACKEND}/api/health"
    echo "[iptv-edge] remote node — waiting for panel at ${REMOTE_HEALTH}..."
    ready=0
    for _ in $(seq 1 45); do
      code="$(curl -sS -o /dev/null -w '%{http_code}' -m 8 "$REMOTE_HEALTH" 2>/dev/null || echo 000)"
      if [ "$code" = "200" ]; then
        echo "[iptv-edge] OK remote panel health HTTP 200"
        ready=1
        break
      fi
      sleep 2
    done
    if [ "$ready" != "1" ]; then
      echo "[iptv-edge] WARN: remote panel health not confirmed — starting edge anyway" >&2
    fi
  fi
  export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-32}"
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
  export IPTV_EDGE_UPSTREAM_SOCKETS="${IPTV_EDGE_UPSTREAM_SOCKETS:-4096}"
  export IPTV_EDGE_LIVE_SOCKETS="${IPTV_EDGE_LIVE_SOCKETS:-512}"
  export IPTV_EDGE_ADMIN_SOCKETS="${IPTV_EDGE_ADMIN_SOCKETS:-256}"
  export IPTV_EDGE_AUTH_CACHE_MS="${IPTV_EDGE_AUTH_CACHE_MS:-120000}"
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
if command -v nginx >/dev/null 2>&1; then
  if ! systemctl is-active --quiet nginx 2>/dev/null; then
    echo "[iptv-edge] WARN: nginx inactive after edge start — attempting start" >&2
    systemctl start nginx 2>/dev/null || true
  fi
fi
if [ "$PANEL_LISTEN" != "80" ] && [ "$IPTV_EDGE_REMOTE_NODE" != "1" ]; then
  if ss -tln 2>/dev/null | grep -qE ':80[[:space:]]'; then
    echo "[iptv-edge] OK panel HTTP :80 is listening"
  else
    echo "[iptv-edge] ERROR: nothing listening on :80 — /admin dashboard would fail" >&2
    exit 1
  fi
fi
if [ "$IPTV_EDGE_REMOTE_NODE" = "1" ]; then
  echo "[iptv-edge] OK remote stream node — backend=${IPTV_EDGE_BACKEND} http=${HTTP_PORTS:-none}"
else
  echo "[iptv-edge] OK backend=${IPTV_EDGE_BACKEND} http=${HTTP_PORTS:-none} https=${HTTPS_PORTS:-none}"
fi
