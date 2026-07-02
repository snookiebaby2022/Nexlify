#!/usr/bin/env bash
# Install nginx on port 3000 for nexlify.live -> 127.0.0.1:3000
# Default: HTTP on :3000 (http://nexlify.live:3000) — fixes "plain HTTP sent to HTTPS port".
# Optional TLS: PANEL_3000_SSL=1 bash scripts/install-nginx-panel-3000.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true

DOMAIN="${PANEL_PRIMARY_DOMAIN:-nexlify.live}"
USE_SSL="${PANEL_3000_SSL:-0}"
CONF_DST="/etc/nginx/sites-available/nexlify-panel-3000"
CONF_TMP="/tmp/nexlify-panel-3000-$$.conf"

pick_conf_src() {
  if [ "$USE_SSL" = "1" ] || [ "$USE_SSL" = "true" ]; then
    for candidate in \
      "$ROOT/scripts/nginx-nexlify-live-3000-ssl.conf" \
      "$ROOT/nginx/nexlify.live-3000-ssl.conf"; do
      if [ -f "$candidate" ]; then
        echo "$candidate"
        return 0
      fi
    done
    return 1
  fi
  for candidate in \
    "$ROOT/nginx/nexlify.live-3000.conf" \
    "$ROOT/scripts/nginx-nexlify-live-3000.conf"; do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

write_embedded_http_conf() {
  cat >"$1" <<'NGINX_EOF'
map $http_x_forwarded_proto $forwarded_proto {
    default $http_x_forwarded_proto;
    ""      $scheme;
}
# upstream in conf.d/nexlify-upstream.conf
server {
    listen 3000;
    listen [::]:3000;
    server_name nexlify.live;
    client_max_body_size 100m;
    large_client_header_buffers 8 64k;
    client_header_buffer_size 32k;
    proxy_buffer_size 128k;
    proxy_buffers 8 128k;
    proxy_busy_buffers_size 256k;
    location / {
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $forwarded_proto;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
    }
}
NGINX_EOF
}

if CONF_SRC="$(pick_conf_src)"; then
  echo "Using nginx config: $CONF_SRC"
  cp "$CONF_SRC" "$CONF_TMP"
elif [ "$USE_SSL" = "1" ] || [ "$USE_SSL" = "true" ]; then
  echo "Missing SSL config file — cannot enable PANEL_3000_SSL"
  exit 1
else
  echo "Using embedded HTTP template for port 3000"
  write_embedded_http_conf "$CONF_TMP"
fi

if [ "$USE_SSL" = "1" ] || [ "$USE_SSL" = "true" ]; then
  if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    echo "SSL cert not found at /etc/letsencrypt/live/${DOMAIN}/"
    echo "Run: sudo certbot certonly --nginx -d ${DOMAIN}"
    rm -f "$CONF_TMP"
    exit 1
  fi
fi

sudo cp "$CONF_TMP" "$CONF_DST"
rm -f "$CONF_TMP"
sudo sed -i "s/server_name nexlify.live;/server_name ${DOMAIN};/" "$CONF_DST"
sudo sed -i "s|/etc/letsencrypt/live/nexlify.live/|/etc/letsencrypt/live/${DOMAIN}/|g" "$CONF_DST"
sudo ln -sf "$CONF_DST" /etc/nginx/sites-enabled/nexlify-panel-3000
sudo nginx -t
sudo systemctl reload nginx

if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 3000/tcp || true
fi

echo ""
echo "Check only nginx (not node) owns public :3000:"
ss -tlnp 2>/dev/null | grep ':3000 ' || true
echo ""
echo "PM2 must listen on 127.0.0.1:3000 only (PANEL_BEHIND_NGINX=1 in .env)"
echo ""

if [ "$USE_SSL" = "1" ] || [ "$USE_SSL" = "true" ]; then
  echo "Panel URL: https://${DOMAIN}:3000/login"
  curl -fsSI "https://127.0.0.1:3000/api/health" --resolve "${DOMAIN}:3000:127.0.0.1" 2>/dev/null || echo "warn: local HTTPS check failed"
else
  echo "Panel URL: http://${DOMAIN}:3000/login"
  echo "(https:// on :3000 needs PANEL_3000_SSL=1 — old SSL config caused 400 Bad Request)"
  curl -fsS "http://127.0.0.1:3000/api/health" && echo "" || echo "warn: Next.js not responding on 127.0.0.1:3000 — run: pm2 restart nexlify --update-env"
fi
