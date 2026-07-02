#!/usr/bin/env bash
# Fix IP-install PM2 crash loop: EADDRINUSE on port 80 from orphan PM2 workers.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
cd "$PANEL_DIR"
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

set -a
[ -f .env ] && . ./.env
set +a

PORT="${PORT:-${PANEL_PORT:-80}}"
BIND="${PANEL_BIND_HOST:-0.0.0.0}"

echo "[fix-port80] Panel dir: $PANEL_DIR port=$PORT bind=$BIND"

echo "[fix-port80] Stopping PM2 apps..."
pm2 stop all 2>/dev/null || true
pm2 jlist 2>/dev/null | node -e "
  const { execSync } = require('child_process');
  try {
    const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    for (const x of list.filter((p) => p.name === 'nexlify')) {
      try { execSync('pm2 delete ' + x.pm_id, { stdio: 'ignore' }); } catch {}
    }
  } catch {}
" 2>/dev/null || true
pm2 delete nexlify 2>/dev/null || true

echo "[fix-port80] Killing orphan node listeners on :${PORT}..."
pkill -f 'next/dist/bin/next' 2>/dev/null || true
pkill -f '/opt/nexlify-panel/.next/standalone/server' 2>/dev/null || true
pkill -f '/home/nexlify-panel/.next/standalone/server' 2>/dev/null || true

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
fi
sleep 2

if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
  echo "[fix-port80] Port still busy — pm2 kill + retry fuser"
  pm2 kill 2>/dev/null || true
  sleep 1
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  sleep 2
fi

if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
  echo "[fix-port80] WARN: port ${PORT} still in use:"
  ss -tlnp | grep ":${PORT} " || true
fi

echo "[fix-port80] Starting panel via pm2-start.sh..."
bash scripts/pm2-start.sh
pm2 save 2>/dev/null || true

echo "[fix-port80] Verify..."
sleep 3
pm2 list
curl -sS -o /dev/null -w "health:%{http_code}\n" "http://127.0.0.1:${PORT}/api/health" || true
echo "[fix-port80] Done"
