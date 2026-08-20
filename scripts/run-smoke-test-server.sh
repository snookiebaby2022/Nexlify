#!/usr/bin/env bash
# Run full smoke test on the panel host (bypass nginx buffer on get.php).
set -euo pipefail
cd /opt/nexlify-panel
git pull -q
npx tsx scripts/clear-login-rate-limit.ts
pm2 restart nexlify --update-env
sleep 4
ADMIN_PASS=$(grep '^INSTALL_ADMIN_PASSWORD=' .env | cut -d= -f2- | tr -d '"')
PANEL_PORT=$(grep '^PANEL_PORT=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "3000")
export PANEL_URL="http://127.0.0.1:${PANEL_PORT:-3000}"
export ADMIN_USER=admin
export ADMIN_PASS="$ADMIN_PASS"
bash test.sh
npx tsx scripts/clear-login-rate-limit.ts
