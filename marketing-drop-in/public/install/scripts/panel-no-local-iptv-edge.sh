#!/usr/bin/env bash
# Source this file. Do not execute.
#
# The customer panel (darkcdn / 45.88.138.18) must NEVER run nexlify-iptv-edge.
# nginx owns :8080 and proxies /live/ to 10gbs. Starting the local edge
# (rematch after an update) 502-loops MPEG-TS and takes every player down.

nexlify_panel_must_not_run_iptv_edge() {
  if [ "${NEXLIFY_PANEL_NO_IPTV_EDGE:-}" = "1" ]; then
    return 0
  fi
  # shellcheck disable=SC1091
  if [ -f "$(dirname "${BASH_SOURCE[0]}")/playback-topology.sh" ]; then
    . "$(dirname "${BASH_SOURCE[0]}")/playback-topology.sh"
    if nexlify_panel_skips_local_iptv_edge; then
      return 0
    fi
  fi
  if [ -f /etc/nexlify/live-routing.lock ] || [ -f /etc/nexlify/server-45-protected ]; then
    return 0
  fi
  return 1
}

nexlify_stop_panel_local_iptv_edge() {
  if ! command -v pm2 >/dev/null 2>&1; then
    return 0
  fi
  # Delete, don't leave stopped apps that a recover script can restart.
  pm2 delete nexlify-iptv-edge >/dev/null 2>&1 || true
  pm2 delete nexlify-hls >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
}
