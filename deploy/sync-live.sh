#!/bin/bash
# Run on VPS after uploading nexlify-deploy.tar.gz to /tmp/
#   bash /var/www/nexlify/deploy/sync-live.sh
set -euo pipefail

APP_DIR="/var/www/nexlify"
ARCHIVE="/tmp/nexlify-deploy.tar.gz"

if [ ! -f "$ARCHIVE" ]; then
  echo "Upload $ARCHIVE first (from Windows: npm run deploy:pack)"
  exit 1
fi

mkdir -p "$APP_DIR"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
chmod +x "$APP_DIR/deploy/"*.sh 2>/dev/null || true

cd "$APP_DIR"
bash "$APP_DIR/deploy/remote-update.sh"
npm run db:seed
bash "$APP_DIR/deploy/ensure-site.sh"

echo ""
echo "Synced. Purge Cloudflare cache, then hard-refresh https://nexlify.live/"
curl -sI http://127.0.0.1:3001 | head -1
