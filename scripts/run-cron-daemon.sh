#!/usr/bin/env bash
# PM2 entrypoint for nexlify-cron — prefers a compiled bundle (no tsx heap bloat).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/usr/local/bin:/usr/lib/postgresql/18/bin:/usr/lib/postgresql/17/bin:/usr/lib/postgresql/16/bin:/usr/lib/postgresql/15/bin:/usr/lib/postgresql/14/bin:/usr/bin:/bin:${PATH:-}"

# Keep the cron worker lean. Build/install scripts often set 3–4GB which lets
# tsx retain a huge heap after large imports / EPG jobs.
CRON_HEAP_MB="${NEXLIFY_CRON_MAX_OLD_SPACE_MB:-1536}"
_CLEAN_NODE_OPTS="$(printf '%s' "${NODE_OPTIONS:-}" | sed -E 's/--max-old-space-size=[0-9]+//g')"
export NODE_OPTIONS="${_CLEAN_NODE_OPTS} --max-old-space-size=${CRON_HEAP_MB}"

BUNDLE="$ROOT/scripts/cron-daemon.bundle.cjs"
if [ -f "$BUNDLE" ]; then
  exec node "$BUNDLE"
fi

# Fallback: build bundle on the fly if esbuild is available
if [ -f "$ROOT/node_modules/esbuild/package.json" ] || command -v esbuild >/dev/null 2>&1; then
  node "$ROOT/scripts/build-cron.mjs" && exec node "$BUNDLE"
fi

bash "$ROOT/scripts/ensure-tsx.sh" >/dev/null 2>&1 || true
TSX_LOCAL="$ROOT/node_modules/tsx/dist/cli.mjs"
if [ -f "$TSX_LOCAL" ]; then
  echo "run-cron-daemon: WARN running via tsx (higher memory) — bundle missing" >&2
  exec node "$TSX_LOCAL" "$ROOT/scripts/cron-daemon.ts"
fi
if command -v tsx >/dev/null 2>&1; then
  exec tsx "$ROOT/scripts/cron-daemon.ts"
fi

echo "run-cron-daemon: neither bundle nor tsx found" >&2
exit 1
