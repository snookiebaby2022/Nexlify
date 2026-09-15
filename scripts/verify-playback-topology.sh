#!/usr/bin/env bash
# Post-deploy: panel health + playback topology (API vs media split).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
[ -f .env ] && . ./.env
set +a

PORT="${PORT:-${PANEL_PORT:-13000}}"
HOST="${PANEL_BIND_HOST:-127.0.0.1}"
[ "$HOST" = "0.0.0.0" ] && HOST="127.0.0.1"

echo "=== panel health ==="
curl -fsS -m 15 "http://${HOST}:${PORT}/api/health" | head -c 200
echo

echo "=== playback topology ==="
npx tsx scripts/verify-playback-topology.mjs

if [ -x scripts/check-live-routing-drift.sh ]; then
  bash scripts/check-live-routing-drift.sh || true
fi

echo "TOPOLOGY_VERIFY_OK"
