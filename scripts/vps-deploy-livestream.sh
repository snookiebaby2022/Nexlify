#!/usr/bin/env bash
# Fix nexlify-web 502 + deploy /livestream on the VPS
# Run: sudo bash scripts/vps-deploy-livestream.sh
set -euo pipefail

MARKETING="${MARKETING_ROOT:-/var/www/nexlify}"
PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PORT="${MARKETING_PORT:-3001}"
PM2_NAME="${MARKETING_PM2:-nexlify-web}"
DROPIN="$PANEL/marketing-drop-in"

if [ ! -d "$MARKETING" ] || [ ! -f "$MARKETING/package.json" ]; then
  echo "Marketing app not found at $MARKETING" >&2
  exit 1
fi

cd "$MARKETING"

echo "=== 1) Copy livestream drop-in (if panel repo present) ==="
if [ -d "$DROPIN/src/app/livestream" ]; then
  mkdir -p src/app/livestream src/app/api/livestream/status src/components src/lib
  cp "$DROPIN/src/app/livestream/page.tsx" src/app/livestream/page.tsx
  cp "$DROPIN/src/app/api/livestream/status/route.ts" src/app/api/livestream/status/route.ts
  cp "$DROPIN/src/components/LivestreamPlayer.tsx" src/components/LivestreamPlayer.tsx
  cp "$DROPIN/src/components/ObsSetupPanel.tsx" src/components/ObsSetupPanel.tsx
  cp "$DROPIN/src/lib/livestream.ts" src/lib/livestream.ts
  echo "Copied from $DROPIN"
else
  echo "WARN: $DROPIN not found — ensure livestream files exist under $MARKETING/src/"
  ls -la src/app/livestream/page.tsx 2>/dev/null || echo "  missing src/app/livestream/page.tsx"
fi

echo ""
echo "=== 2) Set PORT=$PORT in .env ==="
touch .env
if grep -q '^PORT=' .env; then
  sed -i "s/^PORT=.*/PORT=${PORT}/" .env
else
  echo "PORT=${PORT}" >> .env
fi
if grep -q '^HOSTNAME=' .env; then
  sed -i 's/^HOSTNAME=.*/HOSTNAME=127.0.0.1/' .env
else
  echo 'HOSTNAME=127.0.0.1' >> .env
fi

echo ""
echo "=== 3) Build ==="
npm run build

echo ""
echo "=== 4) PM2 on 127.0.0.1:$PORT ==="
pm2 delete "$PM2_NAME" 2>/dev/null || true
PORT="$PORT" HOSTNAME=127.0.0.1 pm2 start npm --name "$PM2_NAME" -- run start
pm2 save

sleep 2
echo ""
echo "=== 5) Verify ==="
curl -sI "http://127.0.0.1:${PORT}/" | head -1
curl -sI "http://127.0.0.1:${PORT}/livestream" | head -1
ss -tlnp | grep -E ":${PORT}\s" || true
pm2 status "$PM2_NAME"

echo ""
echo "Done. Public URL: https://nexlify.live/livestream"
