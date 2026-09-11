#!/usr/bin/env bash
# Source from other scripts — resolves panel dir, listen port, remote media edge.
# Auto-detects from DB + NIC when unset (eval from resolve-live-routing-env.cjs).
# Usage: . "$(dirname "$0")/live-routing-env.sh"

nexlify_panel_root() {
  if [ -n "${PANEL_DIR:-}" ] && [ -d "$PANEL_DIR" ]; then
    echo "$PANEL_DIR"
    return 0
  fi
  if [ -d /opt/nexlify-panel ]; then
    echo /opt/nexlify-panel
    return 0
  fi
  if [ -d /home/nexlify-panel ]; then
    echo /home/nexlify-panel
    return 0
  fi
  echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
}

_nexlify_autodetect_loaded=0

nexlify_load_routing_autodetect() {
  if [ "${NEXLIFY_SKIP_ROUTING_AUTODETECT:-}" = "1" ]; then
    return 0
  fi
  if [ "$_nexlify_autodetect_loaded" = "1" ]; then
    return 0
  fi
  _nexlify_autodetect_loaded=1
  local root detector
  root="$(nexlify_panel_root)"
  detector="$root/scripts/resolve-live-routing-env.cjs"
  if [ ! -f "$detector" ] || ! command -v node >/dev/null 2>&1; then
    return 0
  fi
  # shellcheck disable=SC1090
  eval "$(node "$detector" 2>/dev/null)" || true
}

nexlify_ensure_playback_topology_file() {
  if [ -f /etc/nexlify/playback-topology ]; then
    return 0
  fi
  nexlify_load_routing_autodetect
  local topo remote
  topo="${NEXLIFY_PLAYBACK_TOPOLOGY:-${NEXLIFY_LIVE_EDGE_MODE:-}}"
  remote="$(nexlify_resolve_remote_edge)"
  [ -n "$topo" ] || return 0
  mkdir -p /etc/nexlify
  {
    echo "$topo"
    [ -n "$remote" ] && echo "$remote"
  } > /etc/nexlify/playback-topology
}

nexlify_read_env_kv() {
  local key="$1" root="${2:-}"
  [ -z "$root" ] && root="$(nexlify_panel_root)"
  if [ -f "$root/.env" ]; then
    grep -E "^${key}=" "$root/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
  fi
}

nexlify_resolve_panel_listen() {
  local root port
  root="$(nexlify_panel_root)"
  port="${PANEL_LISTEN:-}"
  [ -z "$port" ] && port="$(nexlify_read_env_kv PORT "$root")"
  [ -z "$port" ] && port="$(nexlify_read_env_kv PANEL_PORT "$root")"
  [ -z "$port" ] && port="13000"
  echo "$port"
}

nexlify_resolve_remote_edge() {
  local remote root
  remote="${NEXLIFY_REMOTE_EDGE:-${REMOTE_EDGE:-}}"
  root="$(nexlify_panel_root)"
  if [ -z "$remote" ] && [ -f /etc/nexlify/playback-topology ]; then
    remote="$(sed -n '2p' /etc/nexlify/playback-topology | tr -d '\r')"
  fi
  if [ -z "$remote" ]; then
    remote="$(nexlify_read_env_kv NEXLIFY_REMOTE_EDGE "$root")"
  fi
  if [ -z "$remote" ]; then
    nexlify_load_routing_autodetect
    remote="${NEXLIFY_REMOTE_EDGE:-}"
  fi
  echo "$remote"
}

nexlify_remote_edge_ip() {
  local remote
  remote="$(nexlify_resolve_remote_edge)"
  echo "${remote%%:*}"
}

nexlify_panel_server_names() {
  local root primary extra names ip
  root="$(nexlify_panel_root)"
  nexlify_load_routing_autodetect
  primary="${PANEL_PRIMARY_DOMAIN:-}"
  [ -z "$primary" ] && primary="$(nexlify_read_env_kv PANEL_PRIMARY_DOMAIN "$root")"
  extra="${NEXLIFY_PANEL_SERVER_NAMES:-}"
  [ -z "$extra" ] && extra="$(nexlify_read_env_kv NEXLIFY_PANEL_SERVER_NAMES "$root")"
  names="_"
  if [ -n "$primary" ]; then
    names="_ ${primary}"
  fi
  if [ -n "$extra" ]; then
    names="${names} ${extra}"
  fi
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [ -n "$ip" ] && ! echo " $names " | grep -q " $ip "; then
    names="${names} ${ip}"
  fi
  echo "$names"
}
