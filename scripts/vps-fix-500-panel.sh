#!/usr/bin/env bash
# Fix nginx 500 on :3000 — rewrite proxy config + ensure Next.js on 127.0.0.1:3000
# Run on VPS from project root: sudo bash scripts/vps-fix-500-panel.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true

if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
  echo "Run with sudo"
  exit 1
fi
SUDO="${SUDO:-sudo}"

echo "=== 1) Rewrite nginx :3000 (HTTP, large headers, no broken keepalive) ==="
bash "$ROOT/scripts/vps-fix-400-port-3000.sh"

echo ""
echo "=== 2) Ensure .env + PM2 bind 127.0.0.1:3000 ==="
if [ -f .env ]; then
  grep -q '^PANEL_BEHIND_NGINX=' .env 2>/dev/null && \
    sed -i 's/^PANEL_BEHIND_NGINX=.*/PANEL_BEHIND_NGINX=1/' .env || \
    echo 'PANEL_BEHIND_NGINX=1' >> .env
  grep -q '^PORT=' .env 2>/dev/null && sed -i 's/^PORT=.*/PORT=3000/' .env || echo 'PORT=3000' >> .env
  grep -q '^PANEL_PORT=' .env 2>/dev/null && sed -i 's/^PANEL_PORT=.*/PANEL_PORT=3000/' .env || echo 'PANEL_PORT=3000' >> .env
fi

set -a
[ -f .env ] && . ./.env
set +a

if [ ! -d .next ]; then
  echo "Building panel..."
  export NEXT_PRIVATE_WORKER_THREADS=false
  npm run build
fi

if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  sudo -u "$SUDO_USER" bash -lc "cd '$ROOT' && ./scripts/pm2-start.sh"
else
  ./scripts/pm2-start.sh
fi

echo ""
echo "=== 3) Wait for app ==="
sleep 3
for i in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo "OK: Next.js health on 127.0.0.1:3000"
    curl -s "http://127.0.0.1:3000/api/health"
    echo ""
    break
  fi
  echo "Waiting for app ($i/5)..."
  sleep 2
done

echo ""
echo "=== 4) Port listeners ==="
ss -tlnp 2>/dev/null | grep ':3000 ' || true

echo ""
echo "=== 5) Through nginx ==="
curl -sI "http://127.0.0.1:3000/login" -H "Host: ${PANEL_PRIMARY_DOMAIN:-nexlify.live}:3000" | head -5 || true

echo ""
echo "If health fails, check: pm2 logs nexlify --lines 50"
echo "Panel URL: http://${PANEL_PRIMARY_DOMAIN:-nexlify.live}:3000/login"
