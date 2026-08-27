#!/usr/bin/env bash
# Refuse panel rebuilds / disruptive restarts while IPTV live traffic is active.
# Prevents next build from starving nexlify workers (root cause of mass 502 / hung /live).
#
# Override: NEXLIFY_FORCE_BUILD=1 or NEXLIFY_FORCE_RESTART=1
set -euo pipefail

STREAMING_BUSY_FILE="${STREAMING_BUSY_FILE:-/tmp/nexlify-streaming-busy}"
CONN_THRESHOLD="${NEXLIFY_STREAM_BUSY_CONN:-8}"
MBPS_THRESHOLD="${NEXLIFY_STREAM_BUSY_MBPS:-8}"

nexlify_guard_root() {
  if [ -n "${PANEL_DIR:-}" ] && [ -f "${PANEL_DIR}/.env" ]; then
    cd "$PANEL_DIR"
    return 0
  fi
  local d
  for d in /opt/nexlify-panel /home/nexlify-panel /home/nexlify; do
    if [ -f "$d/.env" ]; then
      cd "$d"
      return 0
    fi
  done
  return 1
}

nexlify_load_env() {
  set -a
  [ -f .env ] && . ./.env
  set +a
}

nexlify_iface_bytes_per_sec() {
  local iface="${1:-eth0}"
  if [ ! -f "/sys/class/net/$iface/statistics/rx_bytes" ]; then
    iface="lo"
  fi
  local rx1 tx1 rx2 tx2
  rx1=$(cat "/sys/class/net/$iface/statistics/rx_bytes" 2>/dev/null || echo 0)
  tx1=$(cat "/sys/class/net/$iface/statistics/tx_bytes" 2>/dev/null || echo 0)
  sleep 1
  rx2=$(cat "/sys/class/net/$iface/statistics/rx_bytes" 2>/dev/null || echo 0)
  tx2=$(cat "/sys/class/net/$iface/statistics/tx_bytes" 2>/dev/null || echo 0)
  echo $(( (rx2 - rx1 + tx2 - tx1) / 1024 / 1024 ))
}

nexlify_active_live_connections() {
  nexlify_load_env
  local n=0
  if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
    n=$(psql "$DATABASE_URL" -t -A -q -c \
      "select count(*)::int from \"LiveConnection\" where \"lastSeenAt\" > now() - interval '45 seconds';" 2>/dev/null || echo 0)
  elif command -v node >/dev/null 2>&1 && [ -d node_modules/@prisma/client ]; then
    n=$(node -e '
const { PrismaClient } = require("@prisma/client");
const before = new Date(Date.now() - 45 * 1000);
const p = new PrismaClient();
p.liveConnection.count({ where: { lastSeenAt: { gte: before } } })
  .then((c) => { console.log(c); return p.$disconnect(); })
  .catch(() => { console.log(0); return p.$disconnect().catch(() => {}); });
' 2>/dev/null || echo 0)
  fi
  echo "${n:-0}" | tr -d '[:space:]'
}

nexlify_build_in_progress() {
  pgrep -f 'next/dist/bin/next build' >/dev/null 2>&1 \
    || pgrep -f 'rebuild-panel-safe' >/dev/null 2>&1 \
    || pgrep -f 'apply-panel-fast-update' >/dev/null 2>&1
}

nexlify_streaming_traffic_busy() {
  nexlify_load_env
  if [ "${NEXLIFY_USE_IPTV_EDGE:-1}" != "1" ]; then
    return 1
  fi
  local conns mbps
  conns=$(nexlify_active_live_connections)
  mbps=$(nexlify_iface_bytes_per_sec eth0 2>/dev/null || nexlify_iface_bytes_per_sec lo)
  if [ "${conns:-0}" -ge "$CONN_THRESHOLD" ]; then
    echo "[streaming-guard] busy: ${conns} live connection row(s) (threshold ${CONN_THRESHOLD})"
    return 0
  fi
  if [ "${mbps:-0}" -ge "$MBPS_THRESHOLD" ]; then
    echo "[streaming-guard] busy: ~${mbps} MB/s on NIC (threshold ${MBPS_THRESHOLD})"
    return 0
  fi
  return 1
}

nexlify_refuse_build_if_streaming_busy() {
  if [ "${NEXLIFY_FORCE_BUILD:-}" = "1" ]; then
    return 0
  fi
  if nexlify_streaming_traffic_busy; then
    echo "REFUSING panel build: active IPTV streaming load on this host." >&2
    echo "Retry when viewers drop, or set NEXLIFY_FORCE_BUILD=1 during a maintenance window." >&2
    touch "$STREAMING_BUSY_FILE"
    return 1
  fi
  rm -f "$STREAMING_BUSY_FILE" 2>/dev/null || true
  return 0
}

nexlify_refuse_restart_if_streaming_busy() {
  if [ "${NEXLIFY_FORCE_RESTART:-}" = "1" ]; then
    return 0
  fi
  if nexlify_build_in_progress; then
    echo "[streaming-guard] SKIP restart: panel build in progress"
    return 1
  fi
  if nexlify_streaming_traffic_busy; then
    echo "[streaming-guard] SKIP disruptive restart: IPTV load active (set NEXLIFY_FORCE_RESTART=1 to override)"
    return 1
  fi
  return 0
}

nexlify_prune_stale_connections() {
  local root
  root="$(pwd)"
  if [ -x "$root/scripts/prune-stale-live-connections.sh" ]; then
    bash "$root/scripts/prune-stale-live-connections.sh" || true
  fi
}

nexlify_guard_main() {
  local cmd="${1:-check-build}"
  nexlify_guard_root || {
    echo "[streaming-guard] no panel dir — skip"
    return 0
  }
  case "$cmd" in
    check-build)
      nexlify_refuse_build_if_streaming_busy
      ;;
    check-restart)
      nexlify_refuse_restart_if_streaming_busy
      ;;
    prune)
      nexlify_prune_stale_connections
      ;;
    status)
      nexlify_load_env
      echo "connections=$(nexlify_active_live_connections) threshold_conn=${CONN_THRESHOLD}"
      echo "mbps_1s=$(nexlify_iface_bytes_per_sec eth0 2>/dev/null || nexlify_iface_bytes_per_sec lo) threshold_mbps=${MBPS_THRESHOLD}"
      nexlify_streaming_traffic_busy && echo "busy=yes" || echo "busy=no"
      ;;
    *)
      echo "usage: nexlify-streaming-guard.sh [check-build|check-restart|prune|status]" >&2
      return 2
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  nexlify_guard_main "${1:-check-build}"
fi
