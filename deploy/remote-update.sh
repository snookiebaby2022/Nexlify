#!/bin/bash
# Quick redeploy after code changes (no apt installs)
set -euo pipefail
APP_DIR="/var/www/nexlify"
cd "$APP_DIR"

DB_FILE="$APP_DIR/data/nexlify.db"
grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=3001/' .env || echo 'PORT=3001' >> .env
grep -q '^DATABASE_URL=' .env && sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:${DB_FILE}|" .env || echo "DATABASE_URL=file:${DB_FILE}" >> .env
export DATABASE_URL="file:${DB_FILE}"

npm ci
npx prisma generate
mkdir -p data
npx prisma db push 2>/dev/null || npx prisma db push --accept-data-loss
npm run db:seed 2>/dev/null || true
npm run build

# ensure-site starts nexlify-web (never deletes panel PM2 "nexlify" on :3000)
bash "$APP_DIR/deploy/ensure-site.sh"
bash "$APP_DIR/deploy/ensure-whmcs-module.sh" 2>/dev/null || true

echo "Updated. Website :3001 | Panel :3000"
