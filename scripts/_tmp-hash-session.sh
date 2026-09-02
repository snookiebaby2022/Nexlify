#!/bin/bash
set -euo pipefail
cd "${1:-.}"
echo "=== PWD $(pwd) ==="
echo "=== git $(git log -1 --oneline 2>/dev/null || echo nogit) ==="
echo "=== status ==="
git status --short 2>/dev/null | grep -vE '_tmp-|^\?\? \.freebuff' | head -80 || true
echo "=== hashes ==="
for f in \
  package.json \
  src/app/player_api.php/route.ts \
  src/app/panel_api.php/route.ts \
  src/lib/xtream.ts \
  src/lib/xtream-unauth.ts \
  src/lib/xtream-unauth.test.ts \
  src/lib/line-restrictions.ts \
  src/lib/line-restrictions.test.ts \
  src/lib/stream-playback-policy.ts \
  src/lib/stream-playback-policy.test.ts \
  src/lib/live-http-range.ts \
  src/lib/live-http-range.test.ts \
  src/lib/client-playback-profiles.ts \
  src/lib/client-playback-profiles.test.ts \
  src/lib/connection-map-geo.ts \
  src/lib/connection-map-geo.test.ts \
  src/app/api/internal/live-auth/route.ts \
  src/app/api/admin/streams/route.ts \
  src/app/api/admin/streams/mass/route.ts \
  src/app/api/admin/connection-map/route.ts \
  src/components/streams-list.tsx \
  src/components/connection-map.tsx \
  scripts/iptv-edge-proxy.mjs \
  scripts/full-audit-smoke.sh \
  scripts/edge-proxy-parity.test.mjs \
  marketing-drop-in/scripts/nexlify-full-platform-audit.sh
 do
  if [ -f "$f" ]; then md5sum "$f"
  else echo "MISSING $f"
  fi
done
