#!/usr/bin/env bash
# Deploy a six-node 10 Gbps edge pool (5 active + 1 N+1 spare) with health checks.
#
#   EDGE_IPS="209.237.141.15,edge2,edge3,edge4,edge5,edge6" \
#   STREAM_HOST=stream.example.com \
#   PANEL_BACKEND=45.88.138.18:13000 \
#   INTERNAL_API_SECRET=... \
#   bash scripts/deploy-edge-fleet-6.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
log() { echo "[edge-fleet-6] $*"; }

EDGE_IPS="${EDGE_IPS:-}"
STREAM_HOST="${STREAM_HOST:-}"
PANEL_BACKEND="${PANEL_BACKEND:-}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-}"
EDGE_PORT="${EDGE_PORT:-8080}"
ACTIVE_EDGES="${ACTIVE_EDGES:-5}"

if [ -z "$EDGE_IPS" ]; then
  echo "ERROR: EDGE_IPS=ip1,ip2,ip3,ip4,ip5,ip6"
  exit 1
fi

IFS=',' read -ra IPS <<< "$EDGE_IPS"
if [ "${#IPS[@]}" -lt 6 ]; then
  log "WARN: fewer than 6 edges listed — N+1 may be incomplete"
fi

ACTIVE_LIST=""
SPARE=""
idx=0
for ip in "${IPS[@]}"; do
  ip="$(echo "$ip" | xargs)"
  [ -z "$ip" ] && continue
  if [ "$idx" -lt "$ACTIVE_EDGES" ]; then
    ACTIVE_LIST="${ACTIVE_LIST}${ip},"
  else
    SPARE="$ip"
  fi
  idx=$((idx + 1))
done
ACTIVE_LIST="${ACTIVE_LIST%,}"

log "Active edges: ${ACTIVE_LIST:-none}"
log "Spare edge: ${SPARE:-none}"

if [ -n "$PANEL_BACKEND" ] && [ -n "$INTERNAL_API_SECRET" ]; then
  EDGE_HOSTS=""
  for ip in "${IPS[@]}"; do
    ip="$(echo "$ip" | xargs)"
    [ -z "$ip" ] && continue
    EDGE_HOSTS="${EDGE_HOSTS}root@${ip},"
  done
  EDGE_HOSTS="${EDGE_HOSTS%,}"
  EDGE_HOSTS="$EDGE_HOSTS" PANEL_BACKEND="$PANEL_BACKEND" INTERNAL_API_SECRET="$INTERNAL_API_SECRET" \
    bash "$ROOT/scripts/sync-edge-fleet.sh"
fi

EDGE_IPS="$ACTIVE_LIST" STREAM_HOST="${STREAM_HOST:-stream.local}" EDGE_PORT="$EDGE_PORT" \
  bash "$ROOT/scripts/install-multi-edge-lb.sh"

if [ -x "$ROOT/scripts/verify-multi-edge-health.sh" ]; then
  EDGE_IPS="$ACTIVE_LIST" bash "$ROOT/scripts/verify-multi-edge-health.sh" || log "WARN: active pool health check failed"
fi

log "DONE — point ${STREAM_HOST:-streaming DNS} at this LB; spare ${SPARE:-n/a} stays out of rotation until needed"
