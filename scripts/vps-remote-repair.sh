#!/usr/bin/env bash
set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
PANEL=/home/nexlify-panel
MARKETING=/home/nexlify
[ -f /var/www/nexlify/package.json ] && MARKETING=/var/www/nexlify
[ -f "$MARKETING/package.json" ] || MARKETING=/var/www/nexlify

echo "=== Disable nginx on :3000 ==="
for f in /etc/nginx/sites-enabled/*; do
  [ -f "$f" ] || continue
  if grep -qE 'listen[^;]*3000' "$f" 2>/dev/null; then
    case "$f" in *panel.nexlify*|*nexlify.live*) ;; *)
      echo "disable $f"
      rm -f "$f"
    esac
  fi
done
rm -f /etc/nginx/sites-enabled/nexlify-panel-3000 /etc/nginx/sites-enabled/nexlify-panel 2>/dev/null || true

echo "=== Panel .env ==="
cd "$PANEL"
sed -i 's/\r$//' .env scripts/*.sh 2>/dev/null || true
grep -q '^WEBSITE_PORT=' .env && sed -i 's/^WEBSITE_PORT=.*/WEBSITE_PORT=3001/' .env || echo WEBSITE_PORT=3001 >> .env
grep -q '^PANEL_BIND_HOST=' .env && sed -i 's/^PANEL_BIND_HOST=.*/PANEL_BIND_HOST=127.0.0.1/' .env || echo PANEL_BIND_HOST=127.0.0.1 >> .env
grep -q '^PANEL_BEHIND_NGINX=' .env && sed -i 's/^PANEL_BEHIND_NGINX=.*/PANEL_BEHIND_NGINX=1/' .env || echo PANEL_BEHIND_NGINX=1 >> .env
grep -q '^PANEL_PRIMARY_DOMAIN=' .env && sed -i 's/^PANEL_PRIMARY_DOMAIN=.*/PANEL_PRIMARY_DOMAIN=panel.nexlify.live/' .env || echo PANEL_PRIMARY_DOMAIN=panel.nexlify.live >> .env

echo "=== PM2: panel from nexlify-panel ==="
if [ ! -d "$PANEL/.next" ]; then
  cd "$PANEL" && NEXT_PRIVATE_WORKER_THREADS=false npm run build
fi
cd "$PANEL" && chmod +x scripts/*.sh && ./scripts/pm2-start.sh

echo "=== PM2: marketing on :3001 from $MARKETING ==="
if [ -f "$MARKETING/package.json" ]; then
  cd "$MARKETING"
  touch .env
  grep -q '^PORT=' .env 2>/dev/null && sed -i 's/^PORT=.*/PORT=3001/' .env || echo PORT=3001 >> .env
  grep -q '^HOSTNAME=' .env 2>/dev/null && sed -i 's/^HOSTNAME=.*/HOSTNAME=127.0.0.1/' .env || echo HOSTNAME=127.0.0.1 >> .env
  npm run build
  pm2 delete nexlify-web 2>/dev/null || true
  PORT=3001 HOSTNAME=127.0.0.1 pm2 start npm --name nexlify-web -- run start
  pm2 save
fi

echo "=== Nginx ==="
cp "$PANEL/nginx/nexlify-upstream.conf" /etc/nginx/conf.d/nexlify-upstream.conf
cp "$PANEL/nginx/panel.nexlify.live.conf" /etc/nginx/sites-available/panel.nexlify.live
cp "$PANEL/nginx/nexlify.live.conf" /etc/nginx/sites-available/nexlify.live
ln -sf /etc/nginx/sites-available/panel.nexlify.live /etc/nginx/sites-enabled/panel.nexlify.live
ln -sf /etc/nginx/sites-available/nexlify.live /etc/nginx/sites-enabled/nexlify.live
nginx -t && systemctl reload nginx

sleep 4
echo "=== Listeners ==="
ss -tlnp | grep -E ':3000|:3001|:443' || true
echo "=== Health ==="
curl -sS http://127.0.0.1:3000/api/health || echo FAIL
echo ""
curl -sS -o /dev/null -w "marketing %{http_code}\n" http://127.0.0.1:3001/ || echo marketing down
