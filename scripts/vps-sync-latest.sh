#!/usr/bin/env bash
# Sync local panel code to VPS and rebuild both panel + demo
# Run on VPS: sudo bash vps-sync-latest.sh
set -euo pipefail

REPO_DIR="/var/www/nexlify-panel"
MARKETING_ROOT="${MARKETING_ROOT:-/home/nexlify}"
PANEL_PORT="${PANEL_PORT:-3000}"
MARKETING_PORT="${MARKETING_PORT:-3001}"

echo "=== VPS Sync Script ==="
echo "Date: $(date)"
echo ""

# 1. Pull latest code from GitHub
echo "1) Pulling latest from GitHub..."
cd "$REPO_DIR"
git fetch origin
git reset --hard origin/main

# 2. Install dependencies for panel
echo ""
echo "2) Installing panel dependencies..."
npm ci --prefix "$REPO_DIR"

# 3. Run Prisma migrations
echo ""
echo "3) Running Prisma migrations..."
npx prisma migrate deploy --schema "$REPO_DIR/prisma/schema.prisma"

# 4. Build panel
echo ""
echo "4) Building panel..."
cd "$REPO_DIR" && npm run build

# 5. Reload PM2 panel apps
echo ""
echo "5) Reloading PM2 panel apps..."
pm2 reload nexlify || pm2 start "$REPO_DIR/ecosystem.config.cjs" --only nexlify
pm2 reload nexlify-cron || pm2 start "$REPO_DIR/ecosystem.config.cjs" --only nexlify-cron

# 6. Sync marketing site if it exists on VPS (optional)
if [ -d "$MARKETING_ROOT/.git" ] || [ -f "$MARKETING_ROOT/package.json" ]; then
  echo ""
  echo "6) Syncing marketing site..."
  cd "$MARKETING_ROOT"
  if [ -d ".git" ]; then
    git fetch origin
    git reset --hard origin/main
  fi
  npm ci
  npm run build
  pm2 reload nexlify-web 2>/dev/null || true
fi

# 7. Nginx reload
echo ""
echo "7) Reloading nginx..."
nginx -t && systemctl reload nginx

echo ""
echo "=== VPS Sync Complete ==="
echo "Panel:  https://panel.nexlify.live"
echo "Demo:   https://panel.demo.nexlify.live"
echo "Marketing: https://nexlify.live"
