#!/usr/bin/env bash
# One-shot repair: login + update for 75.119.137.174 demo panel.
set -euo pipefail

ADMIN_PASS="${ADMIN_PASS:?Set ADMIN_PASS before running this script}"

PANEL=""
for d in /opt/nexlify-panel /home/nexlify /home/nexlify-panel; do
  [ -f "$d/package.json" ] && PANEL="$d" && break
done
[ -n "$PANEL" ] || { echo "ERROR: panel not found" >&2; exit 1; }
cd "$PANEL"

set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" .env 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}

echo "==> Git sync"
git fetch origin main
git reset --hard origin/main
echo "HEAD=$(git rev-parse --short HEAD)"

echo "==> Env for IP demo host"
set_kv PANEL_PRIMARY_DOMAIN "75.119.137.174"
set_kv PANEL_DEMO_HOSTS "panel.demo.nexlify.live,75.119.137.174"
set_kv PANEL_LICENSE_EXEMPT_HOSTS "panel.nexlify.live,panel.demo.nexlify.live,75.119.137.174,127.0.0.1,localhost"
set_kv NEXLIFY_LICENSE_SKIP "1"
set_kv NEXLIFY_LICENSE_VALID "1"
set_kv NEXLIFY_LICENSE_REQUIRE_ONLINE "0"
set_kv PANEL_BEHIND_NGINX "1"
set_kv INSTALL_ADMIN_PASSWORD "$ADMIN_PASS"

jwt="$(grep '^JWT_SECRET=' .env 2>/dev/null | cut -d= -f2- || true)"
if [ -z "$jwt" ] || [ "${#jwt}" -lt 32 ]; then
  set_kv JWT_SECRET "$(openssl rand -hex 32)"
fi

bash scripts/ensure-panel-env.sh 2>/dev/null || true

echo "==> Admin password"
ADMIN_PASS="$ADMIN_PASS" node scripts/set-admin-password.cjs
node scripts/verify-panel-admin-login.cjs "$ADMIN_PASS"

echo "==> Nginx"
if [ -f /etc/nginx/conf.d/nexlify-rtmp.conf ]; then
  mv /etc/nginx/conf.d/nexlify-rtmp.conf /etc/nginx/conf.d/nexlify-rtmp.conf.disabled
fi
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
    client_max_body_size 100m;
    location / {
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/nexlify-panel-demo /etc/nginx/sites-enabled/nexlify-panel-demo
nginx -t
systemctl reload nginx

echo "==> Rebuild"
chmod +x scripts/*.sh
bash scripts/rebuild-panel-safe.sh

echo "==> Smoke"
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
curl -fsS -A "$UA" -o /dev/null -w 'login=%{http_code}\n' "http://${SERVER_IP}/login"
curl -fsS -A "$UA" -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:13000/api/health
node scripts/verify-panel-admin-login.cjs "$ADMIN_PASS"
echo "Done. http://${SERVER_IP}/login  admin / (password set)"
