#!/usr/bin/env bash
# Rebuild and restart panel on VPS after sync from Windows.
set -euo pipefail
cd "$(dirname "$0")/.."
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true
set -a
[ -f .env ] && . ./.env
set +a
export PORT="${PORT:-${PANEL_PORT:-3000}}"

echo "=== Health (before) on port ${PORT} ==="
curl -s -o /dev/null -w "http://127.0.0.1:${PORT}/api/health -> %{http_code} in %{time_total}s\n" "http://127.0.0.1:${PORT}/api/health" || true

export NEXT_PRIVATE_WORKER_THREADS=false
npm run build
./scripts/pm2-start.sh

echo "=== PM2 ==="
pm2 status
echo "=== Health (after) on port ${PORT} ==="
curl -s -o /dev/null -w "http://127.0.0.1:${PORT}/api/health -> %{http_code} in %{time_total}s\n" "http://127.0.0.1:${PORT}/api/health" || true
curl -s "http://127.0.0.1:${PORT}/api/health" | head -c 400
echo ""
