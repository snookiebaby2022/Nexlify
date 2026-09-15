#!/usr/bin/env bash
# Start or restart nexlify-iptv-edge on LB / 10gbs hosts (never on locked panel).
set -euo pipefail

PANEL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PANEL_DIR"

# shellcheck disable=SC1091
if [ -f "$PANEL_DIR/scripts/panel-no-local-iptv-edge.sh" ]; then
  # shellcheck disable=SC1091
  . "$PANEL_DIR/scripts/panel-no-local-iptv-edge.sh"
  if nexlify_panel_must_not_run_iptv_edge; then
    echo "[ensure-iptv-edge] skip: panel host must not run local iptv-edge"
    exit 0
  fi
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[ensure-iptv-edge] ERROR: pm2 missing" >&2
  exit 1
fi
if [ ! -f "$PANEL_DIR/scripts/iptv-edge-proxy.mjs" ]; then
  echo "[ensure-iptv-edge] ERROR: iptv-edge-proxy.mjs missing" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
[ -f "$PANEL_DIR/.env" ] && . "$PANEL_DIR/.env"
set +a

export IPTV_EDGE_REMOTE_NODE="${IPTV_EDGE_REMOTE_NODE:-1}"
export PANEL_INTERNAL_SECRET="${PANEL_INTERNAL_SECRET:-${PANEL_API_SECRET:-}}"
export PANEL_API_SECRET="${PANEL_API_SECRET:-$PANEL_INTERNAL_SECRET}"
export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-32}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

edge_status() {
  pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print('missing')
    raise SystemExit
for p in data:
    if p.get('name') == 'nexlify-iptv-edge':
        print((p.get('pm2_env') or {}).get('status') or 'unknown')
        raise SystemExit
print('missing')
" 2>/dev/null || echo "missing"
}

STATUS="$(edge_status)"
if [ "$STATUS" = "online" ]; then
  if curl -sS -m 4 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/player_api.php 2>/dev/null | grep -qE '200|401|403'; then
    pm2 save >/dev/null 2>&1 || true
    if [ -x "$PANEL_DIR/scripts/install-iptv-edge-boot.sh" ]; then
      bash "$PANEL_DIR/scripts/install-iptv-edge-boot.sh" >/dev/null 2>&1 || true
    fi
    echo "[ensure-iptv-edge] already online — skip restart"
    exit 0
  fi
  pm2 restart nexlify-iptv-edge --update-env >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
  echo "[ensure-iptv-edge] online but player_api unhealthy — restarted"
  exit 0
fi

if [ -x "$PANEL_DIR/scripts/install-iptv-edge-proxy.sh" ]; then
  IPTV_EDGE_REMOTE_NODE=1 bash "$PANEL_DIR/scripts/install-iptv-edge-proxy.sh" >/dev/null 2>&1 || true
else
  pm2 delete nexlify-iptv-edge >/dev/null 2>&1 || true
  pm2 start "$PANEL_DIR/scripts/iptv-edge-proxy.mjs" \
    --name nexlify-iptv-edge \
    --cwd "$PANEL_DIR" \
    --interpreter node \
    --update-env \
    --max-memory-restart 8192M \
    --time
fi

pm2 save >/dev/null 2>&1 || true
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
if [ -x "$PANEL_DIR/scripts/install-iptv-edge-boot.sh" ]; then
  bash "$PANEL_DIR/scripts/install-iptv-edge-boot.sh" >/dev/null 2>&1 || true
fi

sleep 2
STATUS="$(edge_status)"
echo "[ensure-iptv-edge] status=$STATUS"
if [ "$STATUS" != "online" ]; then
  echo "[ensure-iptv-edge] ERROR: edge not online after start" >&2
  pm2 logs nexlify-iptv-edge --lines 12 --nostream 2>/dev/null || true
  exit 1
fi
