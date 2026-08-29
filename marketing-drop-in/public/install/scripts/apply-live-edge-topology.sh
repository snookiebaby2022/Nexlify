#!/usr/bin/env bash
# Apply NEXLIFY_LIVE_EDGE_MODE=local|remote without touching protected production hosts.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
[ -d "$PANEL_DIR" ] || PANEL_DIR="/home/nexlify-panel"
cd "$PANEL_DIR"

if [ -f /etc/nexlify/server-45-protected ] || [ -f /etc/nexlify/live-routing.lock ]; then
  echo "topology_skip protected_production"
  exit 0
fi

set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a

MODE="${NEXLIFY_LIVE_EDGE_MODE:-local}"
MODE="$(echo "$MODE" | tr '[:upper:]' '[:lower:]')"
REMOTE="${NEXLIFY_REMOTE_EDGE:-}"

case "$MODE" in
  remote|split|remote-edge)
    if [ -z "$REMOTE" ]; then
      echo "ERROR: NEXLIFY_LIVE_EDGE_MODE=remote requires NEXLIFY_REMOTE_EDGE=host:port" >&2
      exit 1
    fi
    export NEXLIFY_REMOTE_EDGE="$REMOTE"
    bash "$PANEL_DIR/scripts/route-live-to-remote-edge.sh"
    ;;
  local|*)
    rm -f /etc/nginx/conf.d/nexlify-live-remote-edge.conf 2>/dev/null || true
    if command -v nginx >/dev/null 2>&1; then
      nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
    fi
    if [ "${NEXLIFY_USE_IPTV_EDGE:-1}" = "1" ] && [ -f "$PANEL_DIR/scripts/install-iptv-edge-proxy.sh" ]; then
      bash "$PANEL_DIR/scripts/install-iptv-edge-proxy.sh"
    fi
    echo "topology_ok mode=local"
    ;;
esac
