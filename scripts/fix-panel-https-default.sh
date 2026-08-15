#!/usr/bin/env bash
# Ensure https://PANEL_IP reaches the Nexlify panel, not another site's SSL vhost
# (e.g. moviestream SPA /admin rewrite → 500 / redirect cycle).
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
[ -f "$PANEL_DIR/package.json" ] || PANEL_DIR="/home/nexlify-panel"
ENV_FILE="$PANEL_DIR/.env"
OUT="/etc/nginx/conf.d/nexlify-panel-ssl.conf"

names=()
add_name() {
  local n="${1:-}"
  n="$(echo "$n" | tr '[:upper:]' '[:lower:]' | sed -e 's#^https\?://##' -e 's#/.*##' -e 's#:.*##' -e 's/"//g' -e "s/'//g" | xargs)"
  [ -z "$n" ] && return 0
  for existing in "${names[@]:-}"; do
    [ "$existing" = "$n" ] && return 0
  done
  names+=("$n")
}

# Always include the machine's public/private IPs first (customer IP installs).
for ip in $(hostname -I 2>/dev/null); do
  add_name "$ip"
done

if [ -f "$ENV_FILE" ]; then
  add_name "$(grep -E '^PANEL_PRIMARY_DOMAIN=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  add_name "$(grep -E '^NEXT_PUBLIC_SERVER_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  extras="$(grep -E '^PANEL_EXTRA_DOMAINS=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' )"
  IFS=',' read -ra EXTRA_ARR <<< "${extras:-}"
  for e in "${EXTRA_ARR[@]:-}"; do add_name "$e"; done
fi
add_name "panel.demo.nexlify.live"

NAMES="${names[*]}"
echo "Panel HTTPS names: $NAMES"

CERT_DIR="/etc/nginx/ssl/nexlify-panel"
mkdir -p "$CERT_DIR"
FIRST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  if [ -f /etc/letsencrypt/live/panel.demo.nexlify.live/fullchain.pem ]; then
    ln -sfn /etc/letsencrypt/live/panel.demo.nexlify.live/fullchain.pem "$CERT_DIR/fullchain.pem"
    ln -sfn /etc/letsencrypt/live/panel.demo.nexlify.live/privkey.pem "$CERT_DIR/privkey.pem"
  else
    SAN="IP:${FIRST_IP}"
    for n in "${names[@]}"; do
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

# Force recreate cert if previous run omitted the IP SAN
if ! openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -text 2>/dev/null | grep -q "$FIRST_IP"; then
  SAN="IP:${FIRST_IP}"
  for n in "${names[@]}"; do
    if echo "$n" | grep -Eq '^[0-9.]+$'; then SAN="$SAN,IP:$n"; else SAN="$SAN,DNS:$n"; fi
  done
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=${FIRST_IP}" \
    -addext "subjectAltName=${SAN}" 2>/dev/null || true
fi

cat > "$OUT" <<NGINX
# Managed by fix-panel-https-default.sh — panel HTTPS default_server
server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name ${NAMES};

    ssl_certificate     ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;

    client_max_body_size 100m;
    large_client_header_buffers 8 64k;

    location / {
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 60s;
        proxy_read_timeout 300s;
    }
}
NGINX

nginx -t
systemctl reload nginx
echo "Panel HTTPS default_server installed ($OUT) for: $NAMES"
