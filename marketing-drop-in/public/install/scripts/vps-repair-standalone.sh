#!/usr/bin/env bash
# Repair panel standalone static assets (fixes client-side Application error).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ ! -f .next/standalone/server.js ]; then
  echo "No standalone build — run: npm run build"
  exit 1
fi

bash scripts/prepare-standalone.sh
bash scripts/verify-standalone.sh

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart nexlify --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --only nexlify --update-env
  pm2 save 2>/dev/null || true
fi

CHUNKS="$(find .next/standalone/.next/static/chunks -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "Repair OK — $CHUNKS standalone chunk files"
curl -sS -o /dev/null -w "Health: HTTP %{http_code}\n" "http://127.0.0.1:${PORT:-13000}/api/health" || true
