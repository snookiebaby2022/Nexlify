#!/bin/bash
# Run on VPS as root after upload to /var/www/nexlify
set -euo pipefail

APP_DIR="/var/www/nexlify"
cd "$APP_DIR"

export DEBIAN_FRONTEND=noninteractive

if ! command -v node &>/dev/null; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs build-essential python3
fi

if ! command -v nginx &>/dev/null; then
  apt-get update
  apt-get install -y nginx
fi

if ! command -v certbot &>/dev/null; then
  apt-get install -y certbot python3-certbot-nginx
fi

if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

mkdir -p "$APP_DIR/data"

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/deploy/env.production.template" "$APP_DIR/.env"
  JWT=$(openssl rand -hex 32)
  PANEL=$(openssl rand -hex 24)
  WHMCS=$(openssl rand -hex 24)
  ADMIN_PASS=$(openssl rand -hex 12)
  sed -i "s|JWT_SECRET=REPLACE_WITH_OPENSSL_RAND_HEX_32|JWT_SECRET=$JWT|" .env
  sed -i "s|PANEL_API_SECRET=REPLACE_PANEL_API_SECRET|PANEL_API_SECRET=$PANEL|" .env
  sed -i "s|WHMCS_API_SECRET=REPLACE_WHMCS_API_SECRET|WHMCS_API_SECRET=$WHMCS|" .env
  sed -i "s|ADMIN_PASSWORD=CHANGE_ADMIN_PASSWORD_NOW|ADMIN_PASSWORD=$ADMIN_PASS|" .env
  echo "Created .env — save admin password: $ADMIN_PASS"
fi

DB_FILE="$APP_DIR/data/nexlify.db"
grep -q '^DATABASE_URL=' .env && sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:${DB_FILE}|" .env || echo "DATABASE_URL=file:${DB_FILE}" >> .env
export DATABASE_URL="file:${DB_FILE}"

echo "Installing dependencies & building..."
npm ci
npx prisma generate
mkdir -p data
[ -f dev.db ] && mv -f dev.db "$DB_FILE" 2>/dev/null || true
npx prisma db push
npm run db:seed
npm run build

grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=3001/' .env || echo 'PORT=3001' >> .env

env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root 2>/dev/null || true

bash "$APP_DIR/deploy/ensure-site.sh"

echo ""
echo "============================================"
echo " Nexlify website on port 3001 | IPTV panel should stay on 3000"
echo " Site: https://nexlify.live (after Cloudflare Full strict + purge)"
echo "============================================"
