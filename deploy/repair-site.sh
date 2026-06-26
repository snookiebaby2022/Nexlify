#!/bin/bash
# Full repair — paste on VPS web console:
#   bash /var/www/nexlify/deploy/repair-site.sh
set -euo pipefail

APP_DIR="/var/www/nexlify"
cd "$APP_DIR" || { echo "Run npm run deploy first — missing $APP_DIR"; exit 1; }

echo "=== REPAIR NEXLIFY ==="

export DEBIAN_FRONTEND=noninteractive
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; apt-get install -y nodejs build-essential; }
command -v nginx >/dev/null || apt-get update && apt-get install -y nginx
command -v pm2 >/dev/null || npm install -g pm2

# Firewall (ignore errors)
ufw allow OpenSSH 2>/dev/null || true
ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true
ufw allow 'Nginx Full' 2>/dev/null || true

touch .env
grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=3001/' .env || echo 'PORT=3001' >> .env
grep -q '^HOSTNAME=' .env || echo 'HOSTNAME=0.0.0.0' >> .env
grep -q '^NEXT_PUBLIC_APP_URL=' .env || echo 'NEXT_PUBLIC_APP_URL=https://nexlify.live' >> .env
grep -q '^JWT_SECRET=' .env || echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

DB_FILE="$APP_DIR/data/nexlify.db"
grep -q '^DATABASE_URL=' .env && sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:${DB_FILE}|" .env || echo "DATABASE_URL=file:${DB_FILE}" >> .env
export DATABASE_URL="file:${DB_FILE}"

npm ci
npx prisma generate
mkdir -p data
npx prisma db push 2>/dev/null || npx prisma db push --accept-data-loss
npm run db:seed 2>/dev/null || true
npm run build

systemctl enable nginx
bash "$APP_DIR/deploy/ensure-site.sh"

sleep 2
bash "$APP_DIR/deploy/diagnose.sh"

echo ""
echo "If 3001 OK but public URL fails: check DNS nexlify.live -> $(curl -s ifconfig.me)"
echo "HTTPS: certbot --nginx -d nexlify.live"
