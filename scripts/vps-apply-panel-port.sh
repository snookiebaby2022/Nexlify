#!/usr/bin/env bash
# Run ON THE VPS after uploading .env with PORT=3000 and WEBSITE_PORT=3001.
set -euo pipefail
cd "$(dirname "$0")/.."
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true

set -a
[ -f .env ] && . ./.env
set +a

PORT="${PORT:-${PANEL_PORT:-3000}}"
WEBSITE="${WEBSITE_PORT:-${STREAM_HTTP_PORT:-3001}}"
echo "=== Applying panel port ${PORT}, website port ${WEBSITE} ==="

node scripts/sync-panel-port.mjs "${PORT}" "${WEBSITE}" || echo "warn: could not sync DB ports"

if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "Opening UFW ports ${PORT} (panel) and ${WEBSITE} (website)..."
  sudo ufw allow "${PORT}/tcp" || true
  sudo ufw allow "${WEBSITE}/tcp" || true
fi

if [ -f scripts/install-nginx-panel-3000.sh ] && command -v nginx >/dev/null 2>&1; then
  sed -i 's/\r$//' scripts/install-nginx-panel-3000.sh 2>/dev/null || true
  chmod +x scripts/install-nginx-panel-3000.sh 2>/dev/null || true
  bash scripts/install-nginx-panel-3000.sh || echo "warn: nginx :3000 install skipped (check certbot / nginx)"
fi

export NEXT_PRIVATE_WORKER_THREADS=false
npm run build
./scripts/pm2-start.sh

echo "=== Listening ==="
ss -tlnp 2>/dev/null | grep -E ":(${PORT}|${WEBSITE}) " || netstat -tlnp 2>/dev/null | grep -E ":(${PORT}|${WEBSITE}) " || true

echo "=== Health (panel) ==="
curl -fsS "http://127.0.0.1:${PORT}/api/health" && echo "" || echo "Health check failed on 127.0.0.1:${PORT}"

IP="$(curl -fsS ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo "Panel (public): https://${PANEL_PRIMARY_DOMAIN:-nexlify.live}:${PORT}"
echo "Panel (local):  http://127.0.0.1:${PORT}/api/health"
echo "Website/Xtream: same origin when WEBSITE_PORT=${WEBSITE} matches panel"
