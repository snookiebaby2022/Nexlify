#!/usr/bin/env bash
# Copy production edge + routing from panel 45 to demo/fleet host 75, then apply nginx live-routing.
set -euo pipefail
P45="${PANEL_45_HOST:-root@45.88.138.18}"
P75="${PANEL_75_HOST:-root@75.119.137.174}"
KEY="${NEXLIFY_SSH_KEY:-$HOME/.ssh/nexlify_deploy}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new)
SCP=(scp -i "$KEY" -o StrictHostKeyChecking=accept-new)
ROOT45=/opt/nexlify-panel
ROOT75=/opt/nexlify-panel

REPO_FILES=(
  scripts/iptv-edge-proxy.mjs
  scripts/edge-redis-slots.mjs
  ecosystem.config.cjs
  scripts/restore-live-proxy-45.sh
)

echo "=== 45 → 75: repo runtime files ==="
for f in "${REPO_FILES[@]}"; do
  echo "  $f"
  "${SCP[@]}" "${P45}:${ROOT45}/${f}" "${P75}:${ROOT75}/${f}"
done

echo "=== 45 → 75: /etc/nexlify playback-topology ==="
"${SSH[@]}" "$P45" "cat /etc/nexlify/playback-topology" | "${SSH[@]}" "$P75" "mkdir -p /etc/nexlify && cat > /etc/nexlify/playback-topology"

echo "=== Apply live nginx on 75 (restore-live-proxy-45.sh) ==="
"${SSH[@]}" "$P75" "cd ${ROOT75} && LIVE_ROUTING_FORCE=1 REMOTE_EDGE=209.237.141.15:8080 bash scripts/restore-live-proxy-45.sh"

echo "=== 45 → 75: live-routing.lock (after restore) ==="
"${SCP[@]}" "${P45}:/etc/nexlify/live-routing.lock" "${P75}:/etc/nexlify/live-routing.lock"

echo "=== nginx test + reload on 75 ==="
"${SSH[@]}" "$P75" "nginx -t && (systemctl reload nginx || service nginx reload)"

echo "=== PM2 reload on 75 ==="
"${SSH[@]}" "$P75" "cd ${ROOT75} && pm2 reload ecosystem.config.cjs --update-env || pm2 reload all --update-env"

echo "=== Done: sync-edge-and-routing-45-to-75 ==="
