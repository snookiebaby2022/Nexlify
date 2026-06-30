#!/usr/bin/env bash
# Wait until at least one nexlify PM2 worker responds on /api/health.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
[ -f .env ] && . ./.env
set +a

PORT="${PORT:-${PANEL_PORT:-13000}}"
HOST="${PANEL_BIND_HOST:-127.0.0.1}"
URL="http://${HOST}:${PORT}/api/health"
MAX_PM2_WAIT="${PANEL_PM2_WAIT_SEC:-90}"
MAX_HEALTH_WAIT="${PANEL_HEALTH_WAIT_SEC:-90}"

echo "Waiting for nexlify PM2 workers (up to ${MAX_PM2_WAIT}s)..."

pm2_deadline=$((SECONDS + MAX_PM2_WAIT))
while [ "$SECONDS" -lt "$pm2_deadline" ]; do
  online="$(pm2 jlist 2>/dev/null | node -e "
    try {
      const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      const apps = list.filter((x) => x.name === 'nexlify');
      const online = apps.filter((a) => a.pm2_env && a.pm2_env.status === 'online').length;
      const launching = apps.filter((a) => a.pm2_env && a.pm2_env.status === 'launching').length;
      process.stdout.write(String(online) + ' ' + String(launching));
    } catch {
      process.stdout.write('0 0');
    }
  " 2>/dev/null || echo "0 0")"
  read -r online_count launching_count <<< "$online"
  if [ "${online_count:-0}" -ge 1 ]; then
    echo "PM2: ${online_count} online, ${launching_count:-0} launching"
    break
  fi
  sleep 2
done

echo "Waiting for ${URL} (up to ${MAX_HEALTH_WAIT}s)..."
health_deadline=$((SECONDS + MAX_HEALTH_WAIT))
while [ "$SECONDS" -lt "$health_deadline" ]; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo "OK: $URL"
    exit 0
  fi
  sleep 2
done

echo "ERROR: panel not ready at $URL after ${MAX_HEALTH_WAIT}s"
pm2 status nexlify 2>/dev/null || true
pm2 logs nexlify --lines 15 --nostream 2>/dev/null || true
exit 1
