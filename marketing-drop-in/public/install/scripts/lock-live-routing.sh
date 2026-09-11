#!/usr/bin/env bash
# Apply known-good live nginx, then chattr +i so recover scripts cannot 302 media paths.
# Usage:
#   bash scripts/lock-live-routing.sh          # apply + lock
#   bash scripts/lock-live-routing.sh unlock   # chattr -i only
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT/scripts/live-routing-env.sh"

cd "$(nexlify_panel_root)" 2>/dev/null || cd "$ROOT"

LOCK_FLAG="/etc/nexlify/live-routing.lock"
NGINX_FILES=(
  /etc/nginx/conf.d/nexlify-live-remote-edge.conf
  /etc/nginx/conf.d/nexlify-panel-http.conf
  /etc/nginx/conf.d/nexlify-panel-https.conf
)
EDGE_FILE="$(nexlify_panel_root)/scripts/iptv-edge-proxy.mjs"

unlock_attr() {
  for f in "${NGINX_FILES[@]}" "$EDGE_FILE"; do
    [ -f "$f" ] || continue
    chattr -i "$f" 2>/dev/null || true
  done
}

if [ "${1:-}" = "unlock" ]; then
  unlock_attr
  rm -f "$LOCK_FLAG"
  node "$(nexlify_panel_root)/scripts/lock-10gbs-edge-attr.cjs" unlock 2>/dev/null || true
  echo "LIVE_ROUTING_UNLOCKED"
  exit 0
fi

unlock_attr
rm -f "$LOCK_FLAG"
LIVE_ROUTING_FORCE=1 bash "$ROOT/scripts/restore-live-proxy.sh"

if grep -R -n --include='*.conf' 'return 302' /etc/nginx/conf.d/nexlify-live-remote-edge.conf /etc/nginx/conf.d/nexlify-panel-http.conf /etc/nginx/conf.d/nexlify-panel-https.conf 2>/dev/null; then
  echo "REFUSE LOCK: 302 still present in nginx live configs" >&2
  exit 1
fi

REMOTE="$(nexlify_resolve_remote_edge)"
REMOTE_IP="$(nexlify_remote_edge_ip)"
mkdir -p /etc/nexlify
cat > "$LOCK_FLAG" <<EOF
locked_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
rule=panel refuses /live/ (502) — media only on remote LB (${REMOTE:-unset})
forbidden=return 302 on live/timeshift/movie/series; panel must not proxy media bitrate
edge=splice locally on stream nodes; panel :8080 must not forward /live/ bitrate
unlock=bash $(nexlify_panel_root)/scripts/lock-live-routing.sh unlock
remote_edge=${REMOTE}
remote_ip=${REMOTE_IP}
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
node "$(nexlify_panel_root)/scripts/lock-10gbs-edge-attr.cjs" 2>/dev/null || true

lsattr "${NGINX_FILES[@]}" "$EDGE_FILE" 2>/dev/null | grep -E '^-' || true
echo "LIVE_ROUTING_LOCKED"
