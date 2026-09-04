#!/usr/bin/env bash
# nginx :443 TLS for panel domain — IPTV → edge :8080, admin → nexlify_panel.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEST="/etc/nginx/conf.d/nexlify-panel-https.conf"
UPSTREAM="/etc/nginx/conf.d/nexlify-upstream.conf"

nexlify_read_env_file() {
  grep "^${1}=" "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

DOMAIN="$(nexlify_read_env_file PANEL_PRIMARY_DOMAIN)"
[ -z "$DOMAIN" ] && DOMAIN="panel.nexlify.live"

CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
if [ ! -f "$CERT" ]; then
  CERT="/etc/nginx/ssl/nexlify-panel/fullchain.pem"
  KEY="/etc/nginx/ssl/nexlify-panel/privkey.pem"
fi
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "[panel-https] No TLS cert — skip (run certbot or fix-panel-https-default.sh)"
  rm -f "$DEST" 2>/dev/null || true
  exit 0
fi

EDGE_PORT="$(nexlify_read_env_file STREAM_EDGE_PORT)"
[ -z "$EDGE_PORT" ] && EDGE_PORT="$(nexlify_read_env_file STREAM_HTTP_PORT)"
[ -z "$EDGE_PORT" ] && EDGE_PORT="8080"

if [ ! -f "$UPSTREAM" ] && [ -f "$ROOT/nginx/nexlify-upstream.conf" ]; then
  cp "$ROOT/nginx/nexlify-upstream.conf" "$UPSTREAM"
fi

cat > "$DEST" <<NGINX
# HTTPS :443 — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN} _;

    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY};
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    client_max_body_size 2048m;
    large_client_header_buffers 8 64k;
    client_header_buffer_size 32k;

    location = /c/ {
        proxy_pass http://nexlify_panel/c;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_read_timeout 300s;
    }

    location = /xmltv.php {
        gzip off;
        proxy_pass http://127.0.0.1:${EDGE_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header X-Nexlify-Client-Port \$server_port;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Accept-Encoding "";
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    location ~ ^/(player_api\.php|panel_api\.php|get\.php|xmltv\.php|live/|timeshift/|movie/|series/|c/|stalker_portal/) {
        proxy_pass http://127.0.0.1:${EDGE_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header X-Nexlify-Client-Port \$server_port;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    location /api/admin/migrate {
        client_max_body_size 2048m;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_pass http://nexlify_panel;
    }

    location / {
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_read_timeout 300s;
        proxy_connect_timeout 3s;
        proxy_intercept_errors on;
        error_page 502 503 504 =503 @nexlify_panel_hold;
    }

    location @nexlify_panel_hold {
        default_type text/html;
        root /var/www/nexlify-updating;
        try_files /updating.html =503;
    }
}
NGINX

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx 2>/dev/null || systemctl start nginx 2>/dev/null || true
fi
echo "[panel-https] OK ${DOMAIN} :443 → edge :${EDGE_PORT} + panel upstream"
