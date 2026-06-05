#!/usr/bin/env bash
# Fix 400 "plain HTTP request was sent to HTTPS port" on :3000 — force HTTP nginx + Next on 127.0.0.1:3000
# Run ON THE VPS: bash scripts/vps-fix-400-port-3000.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
  echo "Run as root or with sudo"
  exit 1
fi
SUDO="${SUDO:-sudo}"

DOMAIN="${PANEL_PRIMARY_DOMAIN:-nexlify.live}"
CONF="/etc/nginx/sites-available/nexlify-panel-3000"
ENABLED="/etc/nginx/sites-enabled/nexlify-panel-3000"

echo "=== 0) Shared upstream (avoids duplicate with panel.nexlify.live vhost) ==="
$SUDO tee /etc/nginx/conf.d/nexlify-upstream.conf >/dev/null <<'UP'
upstream nexlify_panel {
    server 127.0.0.1:3000;
}
UP
for f in /etc/nginx/sites-available/nexlify-panel /etc/nginx/sites-enabled/nexlify-panel \
  /etc/nginx/sites-available/nexlify-panel-3000 /etc/nginx/sites-enabled/nexlify-panel-3000; do
  [ -f "$f" ] && $SUDO sed -i '/^upstream nexlify_panel/,/^}/d' "$f" 2>/dev/null || true
done

echo "=== 1) Writing HTTP-only nginx config for port 3000 ==="
$SUDO tee "$CONF" >/dev/null <<NGINX
map \$http_x_forwarded_proto \$forwarded_proto {
    default \$http_x_forwarded_proto;
    ""      \$scheme;
}

# upstream in /etc/nginx/conf.d/nexlify-upstream.conf

server {
    listen 3000;
    listen [::]:3000;
    server_name ${DOMAIN};

    client_max_body_size 100m;
    large_client_header_buffers 8 64k;
    client_header_buffer_size 32k;
    proxy_buffer_size 128k;
    proxy_buffers 8 128k;
    proxy_busy_buffers_size 256k;

    location ~ ^/(player_api\\.php|get\\.php|live/|c/|stalker_portal/) {
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$forwarded_proto;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    location /api/ {
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$forwarded_proto;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
    }

    location / {
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$forwarded_proto;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_connect_timeout 60s;
        proxy_read_timeout 300s;
    }
}
NGINX

echo "=== 2) Enable site; remove other listeners on 3000 ssl ==="
$SUDO ln -sf "$CONF" "$ENABLED"
for f in "$ENABLED".* /etc/nginx/sites-enabled/*; do
  [ -f "$f" ] || continue
  if [ "$f" != "$ENABLED" ] && grep -q 'listen.*3000.*ssl' "$f" 2>/dev/null; then
    echo "Disabling conflicting site: $f"
    $SUDO rm -f "$f"
  fi
done

echo "=== 3) Other nginx files listening on 3000 (must not be ssl-only) ==="
grep -rn 'listen.*3000' /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>/dev/null || true

echo "=== 4) Test and reload nginx ==="
$SUDO nginx -t
$SUDO systemctl reload nginx

echo "=== 5) Port 3000 listeners ==="
ss -tlnp 2>/dev/null | grep ':3000 ' || netstat -tlnp 2>/dev/null | grep ':3000 ' || true

echo "=== 6) Local checks ==="
if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
  echo "OK: Next.js on 127.0.0.1:3000"
else
  echo "WARN: Nothing on http://127.0.0.1:3000/api/health"
  echo "  Set PANEL_BEHIND_NGINX=1 in .env, then: pm2 restart nexlify --update-env"
  echo "  PM2 must use: next start -H 127.0.0.1 -p 3000"
fi

if curl -fsSI "http://127.0.0.1:3000/login" -H "Host: ${DOMAIN}:3000" 2>/dev/null | head -1 | grep -q '200\|302'; then
  echo "OK: nginx HTTP proxy on :3000"
else
  echo "WARN: nginx proxy check failed — see headers:"
  curl -sI "http://127.0.0.1:3000/login" -H "Host: ${DOMAIN}:3000" 2>/dev/null | head -5 || true
fi

echo ""
echo "Open: http://${DOMAIN}:3000/login"
echo "If still 400, run: grep -rn 'listen.*3000' /etc/nginx/ and paste output"
