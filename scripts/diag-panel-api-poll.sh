#!/usr/bin/env bash
# Poll panel admin API for live connections / stats; CSV log + threshold alerts.
#
# Usage:
#   PANEL_BASE=https://darkcdn.store \
#   PANEL_COOKIE='next-auth.session-token=...' \
#   bash scripts/diag-panel-api-poll.sh
#
# Optional:
#   INTERVAL=30 MAX_CONNECTIONS=400 MAX_LOAD=80 CSV=/tmp/panel-api-poll.csv
#
# Auth via PANEL_COOKIE or PANEL_BEARER — never hardcode secrets in this script.
set -euo pipefail

PANEL_BASE="${PANEL_BASE:-https://darkcdn.store}"
INTERVAL="${INTERVAL:-30}"
MAX_CONNECTIONS="${MAX_CONNECTIONS:-400}"
MAX_LOAD="${MAX_LOAD:-80}"
CSV="${CSV:-/tmp/nexlify-panel-api-poll.csv}"

if [[ -z "${PANEL_COOKIE:-}" && -z "${PANEL_BEARER:-}" ]]; then
  echo "Set PANEL_COOKIE or PANEL_BEARER for admin API auth" >&2
  exit 1
fi

AUTH_HDR=()
if [[ -n "${PANEL_BEARER:-}" ]]; then
  AUTH_HDR=(-H "Authorization: Bearer ${PANEL_BEARER}")
fi
COOKIE_OPTS=()
if [[ -n "${PANEL_COOKIE:-}" ]]; then
  COOKIE_OPTS=(-H "Cookie: ${PANEL_COOKIE}")
fi

if [[ ! -f "$CSV" ]]; then
  echo "timestamp,onlineConnections,networkInMbps,networkOutMbps,load1,cpuPct,diskWarn,alert" >"$CSV"
fi

echo "Polling ${PANEL_BASE} every ${INTERVAL}s → ${CSV}"
echo "Alert if onlineConnections > ${MAX_CONNECTIONS} or load1 > ${MAX_LOAD}"

while true; do
  TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  STATS_JSON="$(curl -sS -m 20 "${AUTH_HDR[@]}" "${COOKIE_OPTS[@]}" \
    "${PANEL_BASE}/api/admin/stats?light=1" || echo '{}')"
  HEALTH_JSON="$(curl -sS -m 15 "${AUTH_HDR[@]}" "${COOKIE_OPTS[@]}" \
    "${PANEL_BASE}/api/admin/health" 2>/dev/null || echo '{}')"

  # Prefer python for JSON; fall back to crude grep if missing
  read -r CONNS IN_MBPS OUT_MBPS LOAD1 CPU DISK_WARN <<<"$(
    STATS_JSON="$STATS_JSON" HEALTH_JSON="$HEALTH_JSON" python3 - <<'PY'
import json, os
stats = json.loads(os.environ.get("STATS_JSON") or "{}")
health = json.loads(os.environ.get("HEALTH_JSON") or "{}")
conns = stats.get("onlineConnections") or stats.get("connections") or 0
inn = stats.get("networkInMbps") or 0
out = stats.get("networkOutMbps") or 0
load = health.get("load") or ""
load1 = 0
if isinstance(load, str) and load.strip():
    try:
        load1 = float(load.split()[0].replace(",", ""))
    except Exception:
        load1 = 0
elif isinstance(load, (int, float)):
    load1 = float(load)
cpu = 0
# health may expose memory/disk strings; leave cpu 0 unless present
if "cpu" in health:
    try:
        cpu = float(str(health["cpu"]).replace("%", "").split()[0])
    except Exception:
        cpu = 0
disk_warn = 0
disk = health.get("disk") or {}
pct = str(disk.get("pct") or "")
try:
    disk_warn = 1 if int("".join(ch for ch in pct if ch.isdigit()) or "0") > 85 else 0
except Exception:
    disk_warn = 0
print(conns, inn, out, load1, cpu, disk_warn)
PY
  )"

  ALERT=0
  MSG=()
  # bash arithmetic — coerce empty
  CONNS="${CONNS:-0}"
  LOAD1="${LOAD1:-0}"
  if awk "BEGIN {exit !(${CONNS} > ${MAX_CONNECTIONS})}"; then
    ALERT=1
    MSG+=("connections=${CONNS}>${MAX_CONNECTIONS}")
  fi
  if awk "BEGIN {exit !(${LOAD1} > ${MAX_LOAD})}"; then
    ALERT=1
    MSG+=("load1=${LOAD1}>${MAX_LOAD}")
  fi

  echo "${TS},${CONNS},${IN_MBPS},${OUT_MBPS},${LOAD1},${CPU},${DISK_WARN},${ALERT}" >>"$CSV"

  if [[ "$ALERT" -eq 1 ]]; then
    echo "ALERT ${TS}: ${MSG[*]}" >&2
  else
    echo "${TS} connections=${CONNS} in=${IN_MBPS}Mbps out=${OUT_MBPS}Mbps load1=${LOAD1}"
  fi

  sleep "$INTERVAL"
done
