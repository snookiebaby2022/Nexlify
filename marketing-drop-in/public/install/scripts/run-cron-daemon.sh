#!/usr/bin/env bash
# PM2 entrypoint for nexlify-cron — resolves tsx from local node_modules or PATH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/ensure-tsx.sh" >/dev/null 2>&1 || true

TSX_LOCAL="$ROOT/node_modules/tsx/dist/cli.mjs"
if [ -f "$TSX_LOCAL" ]; then
  exec node "$TSX_LOCAL" "$ROOT/scripts/cron-daemon.ts"
fi
if command -v tsx >/dev/null 2>&1; then
  exec tsx "$ROOT/scripts/cron-daemon.ts"
fi
if command -v npx >/dev/null 2>&1; then
  exec npx --yes tsx "$ROOT/scripts/cron-daemon.ts"
fi

echo "run-cron-daemon: tsx not found — run: bash scripts/ensure-tsx.sh" >&2
exit 1
