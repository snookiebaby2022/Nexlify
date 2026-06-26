#!/bin/bash
# Run on VPS: bash /var/www/nexlify/deploy/fix-nexlify.sh
set -euo pipefail

APP_DIR="/var/www/nexlify"
cd "$APP_DIR"

echo "=== Nexlify repair (website on 3001, panel stays on 3000) ==="

if [ ! -f package.json ]; then
  echo "ERROR: $APP_DIR missing — upload project first."
  exit 1
fi

# Ensure .env has PORT=3001
touch .env
grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=3001/' .env || echo 'PORT=3001' >> .env
grep -q '^HOSTNAME=' .env || echo 'HOSTNAME=0.0.0.0' >> .env
grep -q '^NEXT_PUBLIC_APP_URL=' .env || echo 'NEXT_PUBLIC_APP_URL=https://nexlify.live' >> .env
grep -q '^JWT_SECRET=' .env || echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

DB_FILE="$APP_DIR/data/nexlify.db"
grep -q '^DATABASE_URL=' .env && sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:${DB_FILE}|" .env || echo "DATABASE_URL=file:${DB_FILE}" >> .env
export DATABASE_URL="file:${DB_FILE}"

echo "--- .env PORT / DB ---"
grep -E '^PORT=|^HOSTNAME=|^DATABASE_URL=' .env

echo "--- Who uses 3000/3001? ---"
ss -tlnp | grep -E ':3000|:3001' || echo "(nothing listening on 3000/3001)"

echo "--- Install / build ---"
npm ci
npx prisma generate
mkdir -p data
npx prisma db push --accept-data-loss 2>/dev/null || npx prisma db push
npm run db:seed 2>/dev/null || true
npm run build

echo "--- PM2 restart ---"
pm2 delete nexlify 2>/dev/null || true
export NEXLIFY_DIR="$APP_DIR"
pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
pm2 save

sleep 3
echo "--- PM2 status ---"
pm2 status nexlify
pm2 logs nexlify --lines 25 --nostream

echo "--- HTTP check ---"
if curl -sfI http://127.0.0.1:3001 | head -1; then
  echo "OK: Nexlify responding on 3001"
else
  echo "FAIL: 3001 not responding — read errors above"
  exit 1
fi

echo "--- Reload nginx ---"
cp "$APP_DIR/deploy/nginx-nexlify.conf" /etc/nginx/sites-available/nexlify.live 2>/dev/null || true
nginx -t && systemctl reload nginx

echo "Done. Public: https://nexlify.live/  Panel: https://nexlify.live/panel/"
