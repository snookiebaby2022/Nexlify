#!/usr/bin/env bash
# Cutover Main panel to classic-lb topology and stop local Node edge on the LB host.
# Run on Main (panel) after classic-lb/install.sh succeeded on the LB VPS.
#
#   CLASSIC_LB_HOST=209.x.x.x bash scripts/cutover-classic-lb.sh
# Optional: CLASSIC_LB_HOST=ip:8090 (internal listen); server_info.port stays 80.
# Optional: SSH_LB=root@209.x.x.x to stop Node edge remotely
# Optional: CLASSIC_LB_DOMAIN=lb.example.com for a dedicated LB hostname
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
HOST="${CLASSIC_LB_HOST:?Set CLASSIC_LB_HOST=ip or ip:8090}"

export CLASSIC_LB_HOST="$HOST"
export SET_TOPOLOGY=1
export NEXLIFY_CLASSIC_LB=1
export NEXLIFY_PLAYBACK_TOPOLOGY=classic-lb
# Topology edge = internal classic-lb listen (default 8090), not advertised Xtream port.
INTERNAL_PORT="${CLASSIC_LB_INTERNAL_PORT:-}"
if [ -z "$INTERNAL_PORT" ]; then
  case "$HOST" in
    *:*) INTERNAL_PORT="${HOST##*:}" ;;
    *) INTERNAL_PORT=8090 ;;
  esac
fi
EDGE_HOST="${HOST%%:*}"
export NEXLIFY_REMOTE_EDGE="${EDGE_HOST}:${INTERNAL_PORT}"
export CLASSIC_LB_INTERNAL_PORT="$INTERNAL_PORT"

node "$ROOT/scripts/ensure-classic-lb-server.cjs"

mkdir -p /etc/nexlify
printf 'classic-lb\n%s\n' "${EDGE_HOST}:${INTERNAL_PORT}" > /etc/nexlify/playback-topology
printf 'classic-lb\n%s\n' "${EDGE_HOST}:${INTERNAL_PORT}" > "$ROOT/.playback-topology" 2>/dev/null || true

# Panel: XUI Main proxies media to classic-lb; stop local iptv-edge
if [ -x "$ROOT/scripts/apply-live-edge-topology.sh" ]; then
  NEXLIFY_PLAYBACK_TOPOLOGY=classic-lb NEXLIFY_REMOTE_EDGE="${EDGE_HOST}:${INTERNAL_PORT}" NEXLIFY_CLASSIC_LB=1 \
    bash "$ROOT/scripts/apply-live-edge-topology.sh"
fi
if [ -x "$ROOT/scripts/lock-live-routing.sh" ]; then
  NEXLIFY_PLAYBACK_TOPOLOGY=classic-lb NEXLIFY_REMOTE_EDGE="${EDGE_HOST}:${INTERNAL_PORT}" NEXLIFY_CLASSIC_LB=1 \
    bash "$ROOT/scripts/lock-live-routing.sh" || true
fi

if [ -n "${SSH_LB:-}" ]; then
  scp -o StrictHostKeyChecking=no "$ROOT/scripts/classic-lb/stop-node-edge.sh" "${SSH_LB}:/tmp/stop-node-edge.sh"
  ssh -o StrictHostKeyChecking=no "$SSH_LB" "bash /tmp/stop-node-edge.sh"
  echo "Probing LB health..."
  curl -fsS --max-time 5 "http://127.0.0.1:${INTERNAL_PORT}/lb/health" \
    || curl -fsS --max-time 5 "http://${EDGE_HOST}:${INTERNAL_PORT}/lb/health" || true
fi

echo "CUTOVER_OK classic-lb host=${EDGE_HOST} internal=${INTERNAL_PORT} advertised_ports=80,8080,443"
echo "Assign streams to Main and/or classic-lb StreamServer — both play on the panel domain."
