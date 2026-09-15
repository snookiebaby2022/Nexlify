#!/usr/bin/env bash
# Verify stream vs panel DNS for Nexlify main/LB wiring (XUI-style).
# Exit 0 if every STREAM_HOST resolves only to LB_IP; non-zero otherwise.
set -euo pipefail
LB_IP="${LB_IP:-209.237.141.15}"
PANEL_HOSTS="${PANEL_HOSTS:-darkcdn.store}"
STREAM_HOSTS="${STREAM_HOSTS:-darkcdn.site}"

ok=0
bad=0

resolve_a() {
  local h="$1"
  if command -v dig >/dev/null 2>&1; then
    dig +short "$h" A | grep -E '^[0-9.]+$' || true
  else
    getent ahostsv4 "$h" 2>/dev/null | awk '{print $1}' | sort -u || true
  fi
}

echo "LB_IP=$LB_IP"
echo "=== panel hosts (must NOT be required to equal LB) ==="
for h in $PANEL_HOSTS; do
  ips=$(resolve_a "$h" | tr '\n' ' ')
  echo "  $h -> $ips"
done

echo "=== stream hosts (each A must include only LB, or at least LB and no CF anycast preferred) ==="
for h in $STREAM_HOSTS; do
  mapfile -t ips < <(resolve_a "$h")
  if [ "${#ips[@]}" -eq 0 ]; then
    echo "  FAIL $h (no A records)"
    bad=$((bad + 1))
    continue
  fi
  has_lb=0
  has_other=0
  for ip in "${ips[@]}"; do
    if [ "$ip" = "$LB_IP" ]; then has_lb=1; else has_other=1; fi
  done
  if [ "$has_lb" -eq 1 ] && [ "$has_other" -eq 0 ]; then
    echo "  OK   $h -> ${ips[*]}"
    ok=$((ok + 1))
  else
    echo "  FAIL $h -> ${ips[*]} (need grey-cloud A=$LB_IP only)"
    bad=$((bad + 1))
  fi
done

echo "summary ok=$ok bad=$bad"
[ "$bad" -eq 0 ]
