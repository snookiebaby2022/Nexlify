#!/usr/bin/env bash
# Apply playback topology: local-edge | remote-splice | multi-lb.
# Never fuser :8080. Never start nexlify-iptv-edge on remote-splice / multi-lb.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
[ -d "$PANEL_DIR" ] || PANEL_DIR="/home/nexlify-panel"
cd "$PANEL_DIR"

# shellcheck disable=SC1091
. "$PANEL_DIR/scripts/playback-topology.sh"
# shellcheck disable=SC1091
[ -f "$PANEL_DIR/scripts/panel-no-local-iptv-edge.sh" ] && . "$PANEL_DIR/scripts/panel-no-local-iptv-edge.sh"

set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a

MODE="$(nexlify_playback_topology)"
[ -z "$MODE" ] && MODE="${NEXLIFY_LIVE_EDGE_MODE:-local-edge}"
MODE="$(echo "$MODE" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"
case "$MODE" in
  remote|split|remote-edge|b) MODE="remote-splice" ;;
  local|a) MODE="local-edge" ;;
  c|lb|multi-server) MODE="multi-lb" ;;
esac

if type nexlify_panel_must_not_run_iptv_edge >/dev/null 2>&1 && nexlify_panel_must_not_run_iptv_edge; then
  MODE="remote-splice"
fi

REMOTE="${NEXLIFY_REMOTE_EDGE:-}"
if [ -z "$REMOTE" ] && [ -f /etc/nexlify/playback-topology ]; then
  REMOTE="$(sed -n '2p' /etc/nexlify/playback-topology | tr -d '\r')"
fi

case "$MODE" in
  remote-splice)
    if [ -z "$REMOTE" ]; then
      echo "WARN: remote-splice without NEXLIFY_REMOTE_EDGE — not rewriting nginx; not starting local edge"
      if type nexlify_stop_panel_local_iptv_edge >/dev/null 2>&1; then
        nexlify_stop_panel_local_iptv_edge
      fi
      echo "topology_ok mode=remote-splice nginx_unchanged"
      exit 0
    fi
    export NEXLIFY_REMOTE_EDGE="$REMOTE"
    bash "$PANEL_DIR/scripts/route-live-to-remote-edge.sh"
    if type nexlify_stop_panel_local_iptv_edge >/dev/null 2>&1; then
      nexlify_stop_panel_local_iptv_edge
    fi
    echo "topology_ok mode=remote-splice"
    ;;
  multi-lb)
    echo "topology_ok mode=multi-lb — panel will not bind local iptv-edge (stream nodes own splice)"
    if type nexlify_stop_panel_local_iptv_edge >/dev/null 2>&1; then
      nexlify_stop_panel_local_iptv_edge
    fi
    ;;
  local-edge|*)
    rm -f /etc/nginx/conf.d/nexlify-live-remote-edge.conf 2>/dev/null || true
    if command -v nginx >/dev/null 2>&1; then
      nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
    fi
    if [ "${NEXLIFY_USE_IPTV_EDGE:-1}" = "1" ] && [ -f "$PANEL_DIR/scripts/install-iptv-edge-proxy.sh" ]; then
      bash "$PANEL_DIR/scripts/install-iptv-edge-proxy.sh"
    fi
    echo "topology_ok mode=local-edge"
    ;;
esac
