#!/usr/bin/env bash
# Repair panel standalone static assets (fixes client-side Application error).
# SKIP_PM2_RESTART=1 — copy assets only (fix-customer-panel calls this after pm2-start).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ ! -f .next/standalone/server.js ]; then
  echo "No standalone build — run: npm run build"
  exit 1
fi

set -a
[ -f .env ] && . ./.env
set +a
PORT="${PORT:-${PANEL_PORT:-13000}}"
HOST="${PANEL_BIND_HOST:-127.0.0.1}"
# curl cannot use 0.0.0.0 as destination — use loopback for local checks
case "$HOST" in 0.0.0.0|::|"*") HOST="127.0.0.1" ;; esac

bash scripts/prepare-standalone.sh
bash scripts/verify-standalone.sh

if [ "${SKIP_PM2_RESTART:-0}" != "1" ] && command -v pm2 >/dev/null 2>&1; then
  if [ -f scripts/pm2-start.sh ]; then
    bash scripts/pm2-start.sh
  else
    pm2 restart nexlify --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --only nexlify --update-env
    pm2 save 2>/dev/null || true
  fi
  if [ -f scripts/wait-panel-ready.sh ]; then
    bash scripts/wait-panel-ready.sh
  else
    for _ in $(seq 1 30); do
      if curl -fsS "http://${HOST}:${PORT}/api/health" >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
  fi
fi

CHUNKS="$(find .next/standalone/.next/static/chunks -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "Repair OK — $CHUNKS standalone chunk files"
curl -sS -o /dev/null -w "Health: HTTP %{http_code}\n" "http://${HOST}:${PORT}/api/health" 2>/dev/null || true
