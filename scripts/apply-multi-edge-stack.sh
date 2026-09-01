#!/usr/bin/env bash
# Multi-edge stack: LB nginx + health verify across EDGE_IPS (5 active + 1 N+1).
#
#   EDGE_IPS="209.237.141.15,edge2,edge3,edge4,edge5,edge6" \
#   ACTIVE_EDGES=5 \
#   STREAM_HOST=darkcdn.store \
#   PANEL_BACKEND=45.88.138.18:13000 \
#   INTERNAL_API_SECRET=... \
#   bash scripts/apply-multi-edge-stack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
log() { echo "[multi-edge] $*"; }

EDGE_IPS="${EDGE_IPS:-}"
STREAM_HOST="${STREAM_HOST:-}"
EDGE_PORT="${EDGE_PORT:-8080}"
ACTIVE_EDGES="${ACTIVE_EDGES:-5}"
PANEL_BACKEND="${PANEL_BACKEND:-}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-}"

if [ -z "$EDGE_IPS" ]; then
  echo "ERROR: EDGE_IPS=ip1,ip2,..."
  exit 1
fi

if [ "${#EDGE_IPS}" -gt 0 ] && [ -n "$PANEL_BACKEND" ] && [ -n "$INTERNAL_API_SECRET" ]; then
  bash "$ROOT/scripts/deploy-edge-fleet-6.sh"
else
  bash "$ROOT/scripts/install-multi-edge-lb.sh"
  if [ -x "$ROOT/scripts/verify-multi-edge-health.sh" ]; then
    bash "$ROOT/scripts/verify-multi-edge-health.sh" || log "WARN: one or more edges unhealthy"
  fi
fi

log "DONE — DNS A record for ${STREAM_HOST:-stream host} → this LB"
log "Grey-cloud recommended for live TS (see docs/IPTV-SCALE.md)"
