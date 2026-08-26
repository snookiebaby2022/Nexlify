#!/usr/bin/env bash
# Repair demo IPTV panel on 75.119.137.174 (or any IP demo install).
# Fixes: nginx down (RTMP in conf.d), missing PM2 nexlify, broken static assets, demo logins.
#
# Run as root on the demo VPS:
#   curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/fix-demo-panel-75.sh' | sudo bash
# Or:
#   sudo bash /opt/nexlify-panel/scripts/fix-demo-panel-75.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

PANEL=""
for d in /home/nexlify /opt/nexlify-panel /home/nexlify-panel; do
  if [ -f "$d/package.json" ]; then PANEL="$d"; break; fi
done
[ -n "$PANEL" ] || { echo "ERROR: panel not found" >&2; exit 1; }

cd "$PANEL"
echo "==> Fix nginx RTMP duplicate (conf.d breaks nginx)"
if [ -f /etc/nginx/conf.d/nexlify-rtmp.conf ]; then
  mv /etc/nginx/conf.d/nexlify-rtmp.conf /etc/nginx/conf.d/nexlify-rtmp.conf.disabled
fi

echo "==> Install panel upstream + IP vhost"
cp -f "$PANEL/nginx/nexlify-upstream.conf" /etc/nginx/conf.d/nexlify-upstream.conf
SERVER_IP="$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
cat > /etc/nginx/sites-available/nexlify-panel-demo <<NGINX
upstream nexlify_panel {
    least_conn;
    server 127.0.0.1:13000;
    keepalive 32;
}
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_IP} panel.demo.nexlify.live;
    client_max_body_size 2048m;
    location ~ ^/(player_api\.php|panel_api\.php|get\.php|xmltv\.php|live/|timeshift/|movie/|series/|c/|stalker_portal/) {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header X-Nexlify-Client-Port \$server_port;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
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
        proxy_set_header X-Forwarded-Proto \$scheme;
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
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/nexlify-panel-demo /etc/nginx/sites-enabled/nexlify-panel-demo
nginx -t
systemctl enable nginx
systemctl start nginx || systemctl reload nginx

echo "==> Sync panel + rebuild if routes broken"
git fetch origin main 2>/dev/null && git reset --hard origin/main 2>/dev/null || true
bash scripts/ensure-panel-env.sh
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
export NEXT_PRIVATE_WORKER_THREADS=false
if ! curl -fsS -A 'Mozilla/5.0' -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/login 2>/dev/null | grep -q 200; then
  npm run build
fi
bash scripts/prepare-standalone.sh

echo "==> Reset demo logins"
bash scripts/fix-vendor-login-500.sh 2>&1 | tail -15 || true

echo "==> Restart panel"
bash scripts/panel-restart-safe.sh --nexlify-only

sleep 5
UA='Mozilla/5.0 (compatible; NexlifyDemoFix/1.0)'
echo "health: $(curl -fsS -A "$UA" -o /dev/null -w '%{http_code}' http://127.0.0.1/api/health)"
echo "login:  $(curl -fsS -A "$UA" -o /dev/null -w '%{http_code}' http://127.0.0.1/login)"
echo "Done. Demo: http://${SERVER_IP}/login  (admin / admin123)"
