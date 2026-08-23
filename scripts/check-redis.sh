#!/usr/bin/env bash
# Verify Redis is configured and reachable (same URL the panel uses via ioredis).
set -euo pipefail
cd "$(dirname "$0")/.."
sed -i 's/\r$//' scripts/check-redis.sh 2>/dev/null || true

set -a
[ -f .env ] && . ./.env
set +a

URL="${REDIS_URL:-redis://127.0.0.1:6379}"

if [ -z "${REDIS_URL:-}" ]; then
  echo "ERROR: REDIS_URL not set — run bash scripts/ensure-panel-env.sh"
  exit 1
fi

if command -v redis-cli >/dev/null 2>&1; then
  if ! redis-cli -u "$URL" ping 2>/dev/null | grep -q PONG; then
    echo "WARN: redis-cli ping failed — starting redis-server..."
    systemctl start redis-server 2>/dev/null || systemctl start redis 2>/dev/null || true
    sleep 1
    redis-cli -u "$URL" ping 2>/dev/null | grep -q PONG || {
      echo "ERROR: Redis not responding at $URL"
      exit 1
    }
  fi
fi

node scripts/check-redis.mjs || exit 1
echo "OK: Redis reachable at $URL"
