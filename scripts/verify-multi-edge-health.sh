#!/usr/bin/env bash
# Health-check every edge in EDGE_IPS (HTTP player_api + edge port).
#   EDGE_IPS="45.88.138.18,75.119.137.174" EDGE_PORT=8080 bash scripts/verify-multi-edge-health.sh
set -euo pipefail

EDGE_IPS="${EDGE_IPS:-}"
EDGE_PORT="${EDGE_PORT:-8080}"
PROBE_USER="${PROBE_USER:-}"
PROBE_PASS="${PROBE_PASS:-}"
fail=0

if [ -z "$EDGE_IPS" ]; then
  echo "ERROR: EDGE_IPS=ip1,ip2,..."
  exit 1
fi

IFS=',' read -ra IPS <<< "$EDGE_IPS"
for ip in "${IPS[@]}"; do
  ip="$(echo "$ip" | xargs)"
  [ -z "$ip" ] && continue
  base="http://${ip}:${EDGE_PORT}"
  code=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$base/player_api.php" 2>/dev/null || echo 000)
  echo "[edge] $ip:$EDGE_PORT player_api → HTTP $code"
  if [ "$code" != "200" ] && [ "$code" != "401" ]; then
    fail=1
  fi
  if [ -n "$PROBE_USER" ] && [ -n "$PROBE_PASS" ]; then
    if bash "$(dirname "$0")/verify-iptv-playback.sh" "$PROBE_USER" "$PROBE_PASS" "$base"; then
      echo "[edge] $ip playback OK"
    else
      echo "[edge] $ip playback FAIL"
      fail=1
    fi
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "[multi-edge-health] PASS"
  exit 0
fi
echo "[multi-edge-health] FAIL"
exit 1
