#!/usr/bin/env bash
# Multi-edge stack: LB nginx + health verify across EDGE_IPS.
#
#   EDGE_IPS="45.88.138.18,75.119.137.174" \
#   STREAM_HOST=darkcdn.store \
#   bash scripts/apply-multi-edge-stack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
log() { echo "[multi-edge] $*"; }

EDGE_IPS="${EDGE_IPS:-}"
STREAM_HOST="${STREAM_HOST:-}"
EDGE_PORT="${EDGE_PORT:-8080}"

if [ -z "$EDGE_IPS" ]; then
  echo "ERROR: EDGE_IPS=ip1,ip2,..."
  exit 1
fi

bash "$ROOT/scripts/install-multi-edge-lb.sh"

if [ -x "$ROOT/scripts/verify-multi-edge-health.sh" ]; then
  bash "$ROOT/scripts/verify-multi-edge-health.sh" || log "WARN: one or more edges unhealthy"
fi

log "DONE — DNS A record for ${STREAM_HOST:-stream host} → this LB"
log "Grey-cloud recommended for live TS (see docs/IPTV-SCALE.md)"
