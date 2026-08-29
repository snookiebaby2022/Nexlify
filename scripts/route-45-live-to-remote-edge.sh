#!/bin/bash
# LOCKED PATH: proxy /live/ → 10gbs. NEVER return 302. See scripts/lock-live-routing-45.sh
set -euo pipefail
if [ -f /etc/nexlify/live-routing.lock ] && [ "${LIVE_ROUTING_FORCE:-}" != "1" ]; then
  if lsattr /etc/nginx/conf.d/nexlify-live-remote-edge.conf 2>/dev/null | grep -q '^....i'; then
    echo "LIVE_ROUTING_LOCKED — skip rewrite"
    exit 0
  fi
fi
export NEXLIFY_REMOTE_EDGE="${NEXLIFY_REMOTE_EDGE:-${REMOTE_EDGE:-209.237.141.15:8080}}"
export REMOTE_EDGE="$NEXLIFY_REMOTE_EDGE"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/route-live-to-remote-edge.sh"
