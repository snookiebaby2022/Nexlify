#!/usr/bin/env bash
# Re-apply local streaming patches after a git reset (no git fetch).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export NEXLIFY_SKIP_GIT_RESET=1
export NEXLIFY_FORCE_BUILD=1
export FORCE=1

LIVE_AUTH="$ROOT/src/app/api/internal/live-auth/route.ts"
if [ -f "$LIVE_AUTH" ]; then
  chattr -i "$LIVE_AUTH" 2>/dev/null || true
  node "$ROOT/scripts/patch-live-auth-edge.cjs" "$LIVE_AUTH"
fi
LINE_PB="$ROOT/src/lib/line-playback.ts"
if [ -f "$LINE_PB" ]; then
  chattr -i "$LINE_PB" 2>/dev/null || true
  node "$ROOT/scripts/patch-line-playback-probe.cjs" "$LINE_PB"
  node "$ROOT/scripts/patch-line-playback-probe-parallel.cjs" "$LINE_PB" 2>/dev/null || true
fi

bash "$ROOT/scripts/apply-panel-fast-update.sh" build-prep
bash "$ROOT/scripts/apply-panel-fast-update.sh" build-compile
bash "$ROOT/scripts/apply-panel-fast-update.sh" swap
bash "$ROOT/scripts/install-iptv-edge-proxy.sh"
pm2 reload nexlify --update-env || pm2 restart nexlify --update-env
set -a; [ -f .env ] && . ./.env; set +a
want=$(( ${PANEL_INSTANCES:-4} + ${NEXLIFY_PANEL_WORKER_SPARE:-1} ))
pm2 scale nexlify "$want" --update-env 2>/dev/null || true
pm2 save >/dev/null 2>&1 || true
echo "[streaming-reapply] done"
