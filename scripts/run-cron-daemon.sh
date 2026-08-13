#!/usr/bin/env bash
# PM2 entrypoint for nexlify-cron — resolves tsx from local node_modules or PATH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/ensure-tsx.sh" >/dev/null 2>&1 || true

# Keep the cron worker lean. Build/install scripts often set 3–4GB which lets
# tsx retain a huge heap after large imports / EPG jobs.
CRON_HEAP_MB="${NEXLIFY_CRON_MAX_OLD_SPACE_MB:-512}"
# Strip any existing max-old-space-size then apply cron cap.
_CLEAN_NODE_OPTS="$(printf '%s' "${NODE_OPTIONS:-}" | sed -E 's/--max-old-space-size=[0-9]+//g')"
export NODE_OPTIONS="${_CLEAN_NODE_OPTS} --max-old-space-size=${CRON_HEAP_MB}"

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
