#!/usr/bin/env bash
# Run full smoke test on the panel host (bypass nginx buffer on get.php).
set -euo pipefail
cd /opt/nexlify-panel
git pull -q
npx tsx scripts/clear-login-rate-limit.ts
pm2 restart nexlify --update-env
sleep 4
ADMIN_PASS=$(grep '^INSTALL_ADMIN_PASSWORD=' .env | cut -d= -f2- | tr -d '"')
PANEL_PORT=$(grep -E '^PANEL_PORT=|^PORT=' .env | head -1 | cut -d= -f2- | tr -d '"' || echo 13000)
# Next.js panel (not nginx :80, not stream agent ports from .env).
export PANEL_URL="${PANEL_URL:-http://127.0.0.1:${PANEL_PORT}}"
export ADMIN_USER=admin
export ADMIN_PASS="$ADMIN_PASS"
bash test.sh
npx tsx scripts/clear-login-rate-limit.ts
