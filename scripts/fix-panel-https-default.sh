#!/usr/bin/env bash
# Ensure TLS cert for https://PANEL_IP and (unless --certs-only) hand off :443
# to the Host-sanitizing IPTV edge proxy (nginx rejects Host: http://… with 400).
set -euo pipefail

CERTS_ONLY=0
if [ "${1:-}" = "--certs-only" ]; then
  CERTS_ONLY=1
fi

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
[ -f "$PANEL_DIR/package.json" ] || PANEL_DIR="/home/nexlify-panel"
ENV_FILE="$PANEL_DIR/.env"
CERT_DIR="/etc/nginx/ssl/nexlify-panel"

env_val() {
  local key="$1"
  [ -f "$ENV_FILE" ] || { echo ""; return 0; }
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

names=()
add_name() {
  local n="${1:-}"
  n="$(echo "$n" | tr '[:upper:]' '[:lower:]' | sed -e 's#^https\?://##' -e 's#/.*##' -e 's#:.*##' -e 's/"//g' -e "s/'//g" | xargs 2>/dev/null || true)"
  [ -z "$n" ] && return 0
  for existing in "${names[@]:-}"; do
    [ "$existing" = "$n" ] && return 0
  done
  names+=("$n")
}

for ip in $(hostname -I 2>/dev/null || true); do
  add_name "$ip"
done

if [ -f "$ENV_FILE" ]; then
  add_name "$(env_val PANEL_PRIMARY_DOMAIN)"
  add_name "$(env_val NEXT_PUBLIC_SERVER_URL)"
  extras="$(env_val PANEL_EXTRA_DOMAINS)"
  IFS=',' read -ra EXTRA_ARR <<< "${extras:-}"
  for e in "${EXTRA_ARR[@]:-}"; do add_name "$e"; done
fi
add_name "panel.demo.nexlify.live"

echo "Panel HTTPS names: ${names[*]}"

mkdir -p "$CERT_DIR"
FIRST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$FIRST_IP" ] && FIRST_IP="127.0.0.1"

need_cert=0
if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  need_cert=1
elif ! openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -text 2>/dev/null | grep -q "$FIRST_IP"; then
  need_cert=1
fi

if [ "$need_cert" = "1" ]; then
  if [ -f /etc/letsencrypt/live/panel.demo.nexlify.live/fullchain.pem ]; then
    ln -sfn /etc/letsencrypt/live/panel.demo.nexlify.live/fullchain.pem "$CERT_DIR/fullchain.pem"
    ln -sfn /etc/letsencrypt/live/panel.demo.nexlify.live/privkey.pem "$CERT_DIR/privkey.pem"
  else
    SAN="IP:${FIRST_IP}"
    for n in "${names[@]:-}"; do
      if echo "$n" | grep -Eq '^[0-9.]+$'; then SAN="$SAN,IP:$n"; else SAN="$SAN,DNS:$n"; fi
    done
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout "$CERT_DIR/privkey.pem" \
      -out "$CERT_DIR/fullchain.pem" \
      -subj "/CN=${FIRST_IP}" \
      -addext "subjectAltName=${SAN}" 2>/dev/null \
      || openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
           -keyout "$CERT_DIR/privkey.pem" \
           -out "$CERT_DIR/fullchain.pem" \
           -subj "/CN=${FIRST_IP}"
  fi
fi

echo "TLS cert ready: $CERT_DIR/fullchain.pem"

if [ "$CERTS_ONLY" = "1" ]; then
  exit 0
fi

# Prefer IPTV edge proxy (accepts http:// and https:// in Host). Falls back to nginx if missing.
if [ -f "$PANEL_DIR/scripts/install-iptv-edge-proxy.sh" ]; then
  bash "$PANEL_DIR/scripts/install-iptv-edge-proxy.sh"
  exit 0
fi

# Legacy nginx :443 (rejects scheme-in-Host — avoid when edge proxy exists)
OUT="/etc/nginx/conf.d/nexlify-panel-ssl.conf"
UPSTREAM="/etc/nginx/conf.d/nexlify-upstream.conf"
PANEL_LISTEN="$(env_val PORT)"
[ -z "$PANEL_LISTEN" ] && PANEL_LISTEN="$(env_val PANEL_PORT)"
[ -z "$PANEL_LISTEN" ] && PANEL_LISTEN="80"
mkdir -p /etc/nginx/conf.d
if [ ! -f "$UPSTREAM" ] || ! grep -q 'upstream nexlify_panel' "$UPSTREAM" 2>/dev/null; then
  cat > "$UPSTREAM" <<UP
upstream nexlify_panel {
    least_conn;
    server 127.0.0.1:${PANEL_LISTEN};
    keepalive 32;
}
UP
fi

NAMES="${names[*]}"
cat > "$OUT" <<NGINX
server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name ${NAMES} _;
    ssl_certificate     ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    location / {
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINX
nginx -t && systemctl reload nginx
echo "Panel HTTPS nginx fallback installed ($OUT)"
