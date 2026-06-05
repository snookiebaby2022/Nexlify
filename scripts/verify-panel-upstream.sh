#!/usr/bin/env bash
# Fail deploy if nginx upstream (127.0.0.1:3000) is not healthy — prevents 502 going live.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
[ -f .env ] && . ./.env
set +a

PORT="${PORT:-${PANEL_PORT:-3000}}"
HOST="${PANEL_BIND_HOST:-127.0.0.1}"
URL="http://${HOST}:${PORT}/api/health"
LOGIN_URL="http://${HOST}:${PORT}/login"

echo "Verifying panel upstream ${HOST}:${PORT} ..."

if ! ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
  echo "ERROR: nothing listening on ${HOST}:${PORT}"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 describe nexlify 2>/dev/null | head -25 || true
  fi
  exit 1
fi

for attempt in 1 2 3 4 5; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo "OK: $URL"
    if curl -fsSI "$LOGIN_URL" 2>/dev/null | head -1 | grep -qE '200|302|307'; then
      echo "OK: $LOGIN_URL"
      exit 0
    fi
    echo "WARN: login route odd response; health passed"
    exit 0
  fi
  sleep 2
done

echo "ERROR: panel not healthy at $URL"
if command -v pm2 >/dev/null 2>&1; then
  pm2 logs nexlify --lines 20 --nostream 2>/dev/null || true
fi
exit 1
