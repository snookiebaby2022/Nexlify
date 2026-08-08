#!/usr/bin/env bash
# Extra HTTPS listen ports for panel + Xtream API (from STREAM_HTTPS_EXTRA_PORTS in .env).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEST="/etc/nginx/conf.d/nexlify-https-extra.conf"
UPSTREAM="/etc/nginx/conf.d/nexlify-upstream.conf"

nexlify_read_env_file() {
  grep "^${1}=" "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

PRIMARY="$(nexlify_read_env_file PANEL_PRIMARY_DOMAIN)"
EXTRA="$(nexlify_read_env_file STREAM_HTTPS_EXTRA_PORTS)"
PRIMARY_SSL="$(nexlify_read_env_file PANEL_SSL_PORT)"
[ -z "$PRIMARY_SSL" ] && PRIMARY_SSL="443"

if [ -z "$EXTRA" ] || [ -z "$PRIMARY" ]; then
  rm -f "$DEST" 2>/dev/null || true
  if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
  fi
  exit 0
fi

CERT="/etc/letsencrypt/live/${PRIMARY}/fullchain.pem"
KEY="/etc/letsencrypt/live/${PRIMARY}/privkey.pem"
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "[https-extra] No TLS cert for ${PRIMARY} — skip extra HTTPS ports (set cert first)"
  rm -f "$DEST" 2>/dev/null || true
  exit 0
fi

if [ ! -f "$UPSTREAM" ] && [ -f "$ROOT/nginx/nexlify-upstream.conf" ]; then
  cp "$ROOT/nginx/nexlify-upstream.conf" "$UPSTREAM"
fi

EXTRA="${EXTRA//,/ }"
{
  echo "# Nexlify extra HTTPS ports — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for p in $EXTRA; do
    [ -z "$p" ] && continue
    [ "$p" = "$PRIMARY_SSL" ] && continue
    cat <<BLOCK
server {
    listen ${p} ssl;
    listen [::]:${p} ssl;
    server_name ${PRIMARY};

    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY};
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 100m;
    large_client_header_buffers 8 64k;

    location ~ ^/(player_api\.php|get\.php|xmltv\.php|live/|movie/|series/|c/|stalker_portal/) {
        add_header Access-Control-Allow-Origin "*" always;
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port ${p};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}

BLOCK
  done
} > "$DEST"

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx
fi

echo "[https-extra] Extra HTTPS ports configured: $EXTRA"
