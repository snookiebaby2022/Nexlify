#!/bin/bash
# Marketing/billing website on 127.0.0.1:3001 (PM2 name: nexlify-web)
set -euo pipefail

APP_DIR="/var/www/nexlify"
cd "$APP_DIR"

echo "=== ensure-app (nexlify-web :3001) ==="

export NEXLIFY_DIR="$APP_DIR"
touch .env
grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=3001/' .env || echo 'PORT=3001' >> .env
grep -q '^HOSTNAME=' .env || echo 'HOSTNAME=0.0.0.0' >> .env
grep -q '^PANEL_DIR=' .env || echo 'PANEL_DIR=/home/nexlify-panel' >> .env
grep -q '^NEXT_PUBLIC_DEMO_PANEL_URL=' .env || echo 'NEXT_PUBLIC_DEMO_PANEL_URL=https://panel.demo.nexlify.live/' >> .env
# Demo login creds must be server-only (DEMO_*), never NEXT_PUBLIC_*
bash "$APP_DIR/deploy/ensure-security-env.sh" 2>/dev/null || true

DB_FILE="$APP_DIR/data/nexlify.db"
grep -q '^DATABASE_URL=' .env && sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:${DB_FILE}|" .env || echo "DATABASE_URL=file:${DB_FILE}" >> .env
export DATABASE_URL="file:${DB_FILE}"

if [ ! -f .next/BUILD_ID ]; then
  echo "Missing build — running npm run build..."
  npm ci
  npx prisma generate
  npm run build
fi

# Remove legacy / wrong PM2 registrations (panel used name "nexlify"; marketing was on :3002)
pm2 delete nexlify 2>/dev/null || true
pm2 delete nexlify-web 2>/dev/null || true

export PORT=3001
export HOSTNAME=0.0.0.0
pm2 start "$APP_DIR/deploy/ecosystem.config.cjs" --only nexlify-web --update-env
pm2 save

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sfI --max-time 3 http://127.0.0.1:3001 | head -1 | grep -qE '200|301|302'; then
    echo "Website OK on :3001"
    exit 0
  fi
  echo "Waiting for :3001 ($i/10)..."
  sleep 2
done

echo "FAIL: website not responding on 3001"
pm2 logs nexlify-web --lines 40 --nostream
exit 1
