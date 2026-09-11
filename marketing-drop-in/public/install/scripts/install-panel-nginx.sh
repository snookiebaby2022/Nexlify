#!/usr/bin/env bash
# Install panel nginx snippets from the repo (any host — auto-detects DB + NIC).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
. "$ROOT/scripts/live-routing-env.sh"
# shellcheck disable=SC1091
. "$ROOT/scripts/playback-topology.sh"

nexlify_load_routing_autodetect
nexlify_ensure_playback_topology_file

PANEL_LISTEN="$(nexlify_resolve_panel_listen)"
SERVER_NAMES="$(nexlify_panel_server_names)"
TOPO="$(nexlify_playback_topology)"
[ -z "$TOPO" ] && TOPO="${NEXLIFY_LIVE_EDGE_MODE:-local-edge}"
TOPO="$(echo "$TOPO" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"

log() { echo "[install-panel-nginx] $*"; }

if ! command -v nginx >/dev/null 2>&1; then
  log "nginx not installed — skip"
  exit 0
fi

mkdir -p /etc/nginx/conf.d

if [ -f "$ROOT/nginx/00-nexlify-mag-ua.conf" ]; then
  cp "$ROOT/nginx/00-nexlify-mag-ua.conf" /etc/nginx/conf.d/00-nexlify-mag-ua.conf
  log "installed 00-nexlify-mag-ua.conf"
fi

UPSTREAM="/etc/nginx/conf.d/nexlify-upstream.conf"
if [ -f "$ROOT/nginx/nexlify-upstream.conf" ]; then
  sed "s/127.0.0.1:13000/127.0.0.1:${PANEL_LISTEN}/" "$ROOT/nginx/nexlify-upstream.conf" > "$UPSTREAM"
  log "installed nexlify-upstream.conf (panel → :${PANEL_LISTEN})"
fi

HTTP_DST="/etc/nginx/conf.d/nexlify-panel-http.conf"
if [ -f "$ROOT/nginx/nexlify-panel-http.conf" ]; then
  sed -e "s/^[[:space:]]*server_name _;/    server_name ${SERVER_NAMES};/" \
    "$ROOT/nginx/nexlify-panel-http.conf" > "$HTTP_DST"
  log "installed nexlify-panel-http.conf (server_name: ${SERVER_NAMES})"
fi

# Legacy demo vhost duplicates default_server and proxies /live/ — remove on upgrade.
if [ -L /etc/nginx/sites-enabled/nexlify-panel-demo ] || [ -f /etc/nginx/sites-enabled/nexlify-panel-demo ]; then
  rm -f /etc/nginx/sites-enabled/nexlify-panel-demo
  log "disabled sites-enabled/nexlify-panel-demo (use conf.d templates)"
fi

if [ -x "$ROOT/scripts/install-nginx-panel-https.sh" ]; then
  bash "$ROOT/scripts/install-nginx-panel-https.sh" || true
fi

case "$TOPO" in
  remote-splice|multi-lb|remote|split)
    export NEXLIFY_REMOTE_EDGE="${NEXLIFY_REMOTE_EDGE:-$(nexlify_resolve_remote_edge)}"
    if [ -n "$NEXLIFY_REMOTE_EDGE" ]; then
      LIVE_ROUTING_FORCE=1 bash "$ROOT/scripts/restore-live-proxy.sh"
      log "applied remote-splice live routing (media 502 on panel)"
    else
      bash "$ROOT/scripts/patch-panel-nginx-live-lock.sh" || true
      log "WARN: remote topology but no NEXLIFY_REMOTE_EDGE — patched :80/:443 only"
      nginx -t && systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
    fi
    ;;
  *)
    nginx -t && systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
    log "local-edge — panel :8080 edge install via install-iptv-edge-proxy.sh"
    ;;
esac

log "done topology=${TOPO}"
