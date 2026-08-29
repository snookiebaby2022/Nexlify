#!/usr/bin/env bash
# Atomic deploy of verified release to server 75 only.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/harden-75-host-guard.sh"

PANEL="${PANEL_ROOT:-/opt/nexlify-panel}"
RELEASE="${PANEL}/releases/harden-${STAMP:-$(date +%Y%m%d-%H%M%S)}"
STAMP=$(basename "$RELEASE" | sed 's/^harden-//')

cd "$PANEL"
echo "==> Deploy stamp $STAMP"

echo "==> Git sync"
git fetch origin main
if ! git reset --hard origin/main; then
  echo UNLOCK_IMMUTABLE
  lsattr -R . 2>/dev/null | awk '/ i/{print $NF}' | head -200 | xargs -r chattr -i || true
  git reset --hard origin/main
fi
git log -1 --oneline

echo "==> Dependencies + schema"
sed -i 's/\r$//' scripts/*.sh scripts/*.mjs ecosystem.config.cjs 2>/dev/null || true
chmod +x scripts/*.sh
npm install --include=dev --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy

echo "==> Quality gates on server"
npm test
node --test scripts/edge-proxy-parity.test.mjs
npx tsc --noEmit
npm run build

echo "==> PM2 rolling reload (panel + cron + edge only)"
bash scripts/ensure-panel-env.sh 2>/dev/null || true
bash scripts/panel-restart-safe.sh --nexlify-only
pm2 restart nexlify-cron --update-env 2>/dev/null || true
if pm2 describe nexlify-iptv-edge >/dev/null 2>&1; then
  pm2 restart nexlify-iptv-edge --update-env
elif pm2 describe nexlify-edge >/dev/null 2>&1; then
  pm2 restart nexlify-edge --update-env
fi
pm2 save

echo "==> Health"
curl -fsS -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:13000/api/health
echo "deploy_ok"
