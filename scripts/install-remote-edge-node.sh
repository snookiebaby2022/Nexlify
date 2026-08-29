#!/usr/bin/env bash
# Install a remote IPTV edge node (no panel DB). Auth hits panel via IPTV_EDGE_BACKEND.
#
#   PANEL_BACKEND=10.0.0.5:13000 \
#   INTERNAL_API_SECRET=... \
#   bash scripts/install-remote-edge-node.sh
#
# Optional stream agent:
#   PANEL_URL=https://panel.example.com AGENT_TOKEN=... bash scripts/install-remote-edge-node.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
log() { echo "[remote-edge] $*"; }

PANEL_BACKEND="${PANEL_BACKEND:-${IPTV_EDGE_BACKEND:-}}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-}"

if [ -z "$PANEL_BACKEND" ]; then
  echo "ERROR: set PANEL_BACKEND=panel-ip:13000"
  exit 1
fi

set_kv() {
  local k="$1" v="$2"
  touch .env
  if grep -q "^${k}=" .env 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}

set_kv NEXLIFY_USE_IPTV_EDGE 1
set_kv IPTV_EDGE_BACKEND "$PANEL_BACKEND"
set_kv IPTV_EDGE_REMOTE_NODE 1
set_kv STREAM_EDGE_PORT 8080
set_kv STREAM_HTTP_EXTRA_PORTS "8080,25461"
set_kv IPTV_EDGE_HTTP_PORTS "8080,25461"
set_kv STREAM_HTTPS_PORT ""
set_kv IPTV_EDGE_HTTPS_PORTS ""
set_kv IPTV_EDGE_UPSTREAM_SOCKETS "${IPTV_EDGE_UPSTREAM_SOCKETS:-8192}"
set_kv IPTV_EDGE_LIVE_SOCKETS "${IPTV_EDGE_LIVE_SOCKETS:-1024}"
set_kv UV_THREADPOOL_SIZE "${UV_THREADPOOL_SIZE:-64}"

if [ -n "$INTERNAL_API_SECRET" ]; then
  set_kv INTERNAL_API_SECRET "$INTERNAL_API_SECRET"
fi

bash "$ROOT/scripts/tune-streaming-host.sh"
bash "$ROOT/scripts/tune-kernel-20k.sh" 2>/dev/null || bash "$ROOT/scripts/tune-streaming-host.sh"

if [ ! -d node_modules ]; then
  log "installing minimal node deps for edge..."
  npm ci --omit=dev 2>/dev/null || npm install --omit=dev 2>/dev/null || true
fi

bash "$ROOT/scripts/install-iptv-edge-proxy.sh"

if [ -n "${AGENT_TOKEN:-}" ] && [ -n "${PANEL_URL:-}" ]; then
  export PANEL_URL AGENT_TOKEN
  bash "$ROOT/scripts/install-remote-stream-agent.sh"
fi

log "edge node ready — backend=$PANEL_BACKEND"
log "verify: bash scripts/verify-iptv-playback.sh USER PASS http://127.0.0.1:8080"
