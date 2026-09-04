#!/usr/bin/env bash
# Source this file. Canonical live topology for apply / rematch / pm2-start.
# Values: local-edge | remote-splice | multi-lb

nexlify_playback_topology() {
  local raw=""
  if [ -n "${NEXLIFY_PLAYBACK_TOPOLOGY:-}" ]; then
    raw="${NEXLIFY_PLAYBACK_TOPOLOGY}"
  elif [ -f /etc/nexlify/playback-topology ]; then
    raw="$(head -1 /etc/nexlify/playback-topology | tr -d '\r')"
  elif [ -n "${NEXLIFY_PANEL_ROOT:-}" ] && [ -f "${NEXLIFY_PANEL_ROOT}/.playback-topology" ]; then
    raw="$(head -1 "${NEXLIFY_PANEL_ROOT}/.playback-topology" | tr -d '\r')"
  elif [ -f "$(dirname "${BASH_SOURCE[0]}")/../.playback-topology" ]; then
    raw="$(head -1 "$(dirname "${BASH_SOURCE[0]}")/../.playback-topology" | tr -d '\r')"
  elif [ -n "${NEXLIFY_LIVE_EDGE_MODE:-}" ]; then
    raw="${NEXLIFY_LIVE_EDGE_MODE}"
  fi
  raw="$(echo "$raw" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"
  case "$raw" in
    a|local|local-edge|panel-edge) echo "local-edge" ;;
    b|remote|remote-splice|remote-edge|split|panel-only) echo "remote-splice" ;;
    c|multi-lb|lb|multi-server) echo "multi-lb" ;;
    *) echo "" ;;
  esac
}

nexlify_panel_skips_local_iptv_edge() {
  local topo
  topo="$(nexlify_playback_topology)"
  case "$topo" in
    remote-splice|multi-lb) return 0 ;;
  esac
  return 1
}
