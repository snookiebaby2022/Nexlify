#!/usr/bin/env bash
# Redis hardening for high-connection IPTV (auth + catalog cache).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
log() { echo "[redis-prod] $*"; }

set -a
[ -f .env ] && . ./.env
set +a
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
TARGET="${NEXLIFY_REDIS_MAXMEMORY:-2048mb}"

if ! command -v redis-cli >/dev/null 2>&1; then
  log "install redis-server first"
  exit 1
fi

systemctl start redis-server 2>/dev/null || systemctl start redis 2>/dev/null || true
if ! redis-cli -u "$REDIS_URL" ping 2>/dev/null | grep -q PONG; then
  log "ERROR: Redis not reachable at $REDIS_URL"
  exit 1
fi

redis-cli -u "$REDIS_URL" CONFIG SET maxmemory "$TARGET" >/dev/null
redis-cli -u "$REDIS_URL" CONFIG SET maxmemory-policy allkeys-lru >/dev/null
redis-cli -u "$REDIS_URL" CONFIG SET tcp-keepalive 300 >/dev/null
redis-cli -u "$REDIS_URL" CONFIG SET timeout 0 >/dev/null
redis-cli -u "$REDIS_URL" CONFIG REWRITE >/dev/null 2>&1 || true

log "maxmemory=$TARGET allkeys-lru tcp-keepalive=300"
log "OK"
