#!/usr/bin/env bash
# Fail deploy if panel upstream is not healthy — prevents 502 going live.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
[ -f .env ] && . ./.env
set +a

PORT="${PORT:-${PANEL_PORT:-13000}}"
HOST="${PANEL_BIND_HOST:-127.0.0.1}"
URL="http://${HOST}:${PORT}/api/health"
LOGIN_URL="http://${HOST}:${PORT}/login"
VERIFY_UA="${NEXLIFY_VERIFY_UA:-Mozilla/5.0 (compatible; NexlifyInstallVerify/1.0)}"

echo "Verifying panel upstream ${HOST}:${PORT} ..."

if ! bash scripts/wait-panel-ready.sh; then
  exit 1
fi

if curl -fsSI -H "User-Agent: $VERIFY_UA" "$LOGIN_URL" 2>/dev/null | head -1 | grep -qE '200|302|307'; then
  echo "OK: $LOGIN_URL"
  exit 0
fi

echo "WARN: login route odd response; health passed"
exit 0
