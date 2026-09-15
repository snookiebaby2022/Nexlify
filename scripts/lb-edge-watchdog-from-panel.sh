#!/usr/bin/env bash
# Panel-side: if primary edge stream port is down, SSH-recover all LBs (fast path).
set -euo pipefail

PANEL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PANEL_DIR"
set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a

LOG="${1:-/var/log/nexlify-watchdog.log}"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] lb-edge-watchdog: $*" >>"$LOG"; }

PROBE_HOST="${NEXLIFY_EDGE_PROBE_HOST:-209.237.141.15}"
PROBE_PORT="${NEXLIFY_EDGE_PROBE_PORT:-8080}"
PROBE_URL="http://${PROBE_HOST}:${PROBE_PORT}/player_api.php"

code="$(curl -sS -o /dev/null -w '%{http_code}' -m 8 "$PROBE_URL" 2>/dev/null || echo 000)"
if [ "$code" = "200" ] || [ "$code" = "401" ] || [ "$code" = "403" ]; then
  exit 0
fi

log "WARN edge probe ${PROBE_URL} -> HTTP ${code} — running LB recover"

if [ -f "$PANEL_DIR/scripts/recover-lbs-after-reboot.cjs" ]; then
  node "$PANEL_DIR/scripts/recover-lbs-after-reboot.cjs" >>"$LOG" 2>&1 || true
elif [ -f "$PANEL_DIR/scripts/recover-10gbs-edge.cjs" ]; then
  node "$PANEL_DIR/scripts/recover-10gbs-edge.cjs" >>"$LOG" 2>&1 || true
fi

code2="$(curl -sS -o /dev/null -w '%{http_code}' -m 12 "$PROBE_URL" 2>/dev/null || echo 000)"
log "edge probe after recover -> HTTP ${code2}"
