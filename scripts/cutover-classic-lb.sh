#!/usr/bin/env bash
# Cutover Main panel to classic-lb topology and stop local Node edge on the LB host.
# Run on Main (panel) after classic-lb/install.sh succeeded on the LB VPS.
#
#   CLASSIC_LB_HOST=209.x.x.x:8080 bash scripts/cutover-classic-lb.sh
# Optional: SSH_LB=root@209.x.x.x to stop Node edge remotely
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
HOST="${CLASSIC_LB_HOST:?Set CLASSIC_LB_HOST=ip:8080}"

export CLASSIC_LB_HOST="$HOST"
export SET_TOPOLOGY=1
export NEXLIFY_CLASSIC_LB=1
export NEXLIFY_PLAYBACK_TOPOLOGY=classic-lb
export NEXLIFY_REMOTE_EDGE="$HOST"

node "$ROOT/scripts/ensure-classic-lb-server.cjs"

mkdir -p /etc/nexlify
printf 'classic-lb\n%s\n' "$HOST" > /etc/nexlify/playback-topology
printf 'classic-lb\n%s\n' "$HOST" > "$ROOT/.playback-topology" 2>/dev/null || true

# Panel: 502 media, no local iptv-edge
if [ -x "$ROOT/scripts/apply-live-edge-topology.sh" ]; then
  NEXLIFY_PLAYBACK_TOPOLOGY=classic-lb NEXLIFY_REMOTE_EDGE="$HOST" NEXLIFY_CLASSIC_LB=1 \
    bash "$ROOT/scripts/apply-live-edge-topology.sh"
fi
if [ -x "$ROOT/scripts/lock-live-routing.sh" ]; then
  NEXLIFY_PLAYBACK_TOPOLOGY=classic-lb NEXLIFY_REMOTE_EDGE="$HOST" NEXLIFY_CLASSIC_LB=1 \
    bash "$ROOT/scripts/lock-live-routing.sh" || true
fi

if [ -n "${SSH_LB:-}" ]; then
  scp -o StrictHostKeyChecking=no "$ROOT/scripts/classic-lb/stop-node-edge.sh" "${SSH_LB}:/tmp/stop-node-edge.sh"
  ssh -o StrictHostKeyChecking=no "$SSH_LB" "bash /tmp/stop-node-edge.sh"
  echo "Probing LB health..."
  curl -fsS --max-time 5 "http://${HOST%%:*}:${HOST##*:}/lb/health" || curl -fsS --max-time 5 "http://${HOST}/lb/health" || true
fi

echo "CUTOVER_OK classic-lb host=${HOST}"
echo "Assign streams to the classic LB StreamServer (serverId) so live-auth allows playback."
