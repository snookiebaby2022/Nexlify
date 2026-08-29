#!/usr/bin/env bash
# Apply known-good live nginx, then chattr +i so recover/offload scripts cannot 302 it.
# Usage:
#   bash scripts/lock-live-routing-45.sh          # apply + lock
#   bash scripts/lock-live-routing-45.sh unlock    # chattr -i only
set -euo pipefail
if ! hostname -I 2>/dev/null | tr ' ' '\n' | grep -qx '45.88.138.18'; then
  echo "ABORT: live routing lock may only run on server 45 (45.88.138.18)" >&2
  exit 1
fi
cd /opt/nexlify-panel 2>/dev/null || cd "$(dirname "$0")/.."

LOCK_FLAG="/etc/nexlify/live-routing.lock"
NGINX_FILES=(
  /etc/nginx/conf.d/nexlify-live-remote-edge.conf
  /etc/nginx/conf.d/nexlify-panel-http.conf
  /etc/nginx/conf.d/nexlify-panel-https.conf
)
EDGE_FILE="/opt/nexlify-panel/scripts/iptv-edge-proxy.mjs"

unlock_attr() {
  for f in "${NGINX_FILES[@]}" "$EDGE_FILE"; do
    [ -f "$f" ] || continue
    chattr -i "$f" 2>/dev/null || true
  done
}

if [ "${1:-}" = "unlock" ]; then
  unlock_attr
  rm -f "$LOCK_FLAG"
  node /opt/nexlify-panel/scripts/lock-10gbs-edge-attr.cjs unlock 2>/dev/null || true
  echo "LIVE_ROUTING_UNLOCKED"
  exit 0
fi

unlock_attr
rm -f "$LOCK_FLAG"
LIVE_ROUTING_FORCE=1 bash /opt/nexlify-panel/scripts/restore-live-proxy-45.sh

if grep -R -n --include='*.conf' 'return 302' /etc/nginx/conf.d/nexlify-live-remote-edge.conf /etc/nginx/conf.d/nexlify-panel-http.conf /etc/nginx/conf.d/nexlify-panel-https.conf 2>/dev/null; then
  echo "REFUSE LOCK: 302 still present in nginx live configs" >&2
  exit 1
fi

mkdir -p /etc/nexlify
cat > "$LOCK_FLAG" <<EOF
locked_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
rule=proxy /live/ to 209.237.141.15:8080
forbidden=return 302 on live/timeshift/movie/series
edge=splice locally, never forward /live/ to panel :8080
unlock=bash /opt/nexlify-panel/scripts/lock-live-routing-45.sh unlock
EOF

for f in "${NGINX_FILES[@]}"; do
  [ -f "$f" ] || continue
  chattr +i "$f"
  echo "immutable $f"
done
if [ -f "$EDGE_FILE" ]; then
  chattr +i "$EDGE_FILE"
  echo "immutable $EDGE_FILE"
fi
node /opt/nexlify-panel/scripts/lock-10gbs-edge-attr.cjs 2>/dev/null || true

lsattr "${NGINX_FILES[@]}" "$EDGE_FILE" 2>/dev/null | grep -E '^-' || true
echo "LIVE_ROUTING_LOCKED"
