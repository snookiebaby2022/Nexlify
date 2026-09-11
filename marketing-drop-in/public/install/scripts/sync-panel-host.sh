#!/usr/bin/env bash
# Copy panel runtime + nginx from a known-good host to another (fleet ops).
# Required:
#   SOURCE_HOST=root@source.example.com
#   TARGET_HOST=root@target.example.com
# Optional:
#   NEXLIFY_SSH_KEY=~/.ssh/id_rsa
#   PANEL_ROOT=/opt/nexlify-panel
set -euo pipefail

SOURCE_HOST="${SOURCE_HOST:-}"
TARGET_HOST="${TARGET_HOST:-}"
if [ -z "$SOURCE_HOST" ] || [ -z "$TARGET_HOST" ]; then
  echo "Usage: SOURCE_HOST=root@a TARGET_HOST=root@b bash scripts/sync-panel-host.sh" >&2
  exit 1
fi

KEY="${NEXLIFY_SSH_KEY:-$HOME/.ssh/nexlify_deploy}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new)
SCP=(scp -i "$KEY" -o StrictHostKeyChecking=accept-new)
ROOT="${PANEL_ROOT:-/opt/nexlify-panel}"

REPO_FILES=(
  scripts/iptv-edge-proxy.mjs
  scripts/edge-redis-slots.mjs
  ecosystem.config.cjs
  scripts/restore-live-proxy.sh
  scripts/lock-live-routing.sh
  scripts/live-routing-env.sh
  scripts/patch-panel-nginx-live-lock.sh
  scripts/install-panel-nginx.sh
)

NGINX_CONF=(
  00-nexlify-mag-ua.conf
  nexlify-panel-http.conf
  nexlify-panel-https.conf
  nexlify-cloudflare-realip.conf
)

echo "=== ${SOURCE_HOST} → ${TARGET_HOST}: repo runtime files ==="
for f in "${REPO_FILES[@]}"; do
  echo "  $f"
  "${SCP[@]}" "${SOURCE_HOST}:${ROOT}/${f}" "${TARGET_HOST}:${ROOT}/${f}" 2>/dev/null || \
    "${SCP[@]}" "${SOURCE_HOST}:${ROOT}/${f}" "${TARGET_HOST}:${ROOT}/${f}"
done

echo "=== nginx conf.d (from source host) ==="
for c in "${NGINX_CONF[@]}"; do
  if "${SSH[@]}" "$SOURCE_HOST" "test -f /etc/nginx/conf.d/${c}"; then
    echo "  $c"
    "${SCP[@]}" "${SOURCE_HOST}:/etc/nginx/conf.d/${c}" "${TARGET_HOST}:/etc/nginx/conf.d/${c}"
  fi
done

echo "=== /etc/nexlify playback-topology ==="
"${SSH[@]}" "$SOURCE_HOST" "cat /etc/nexlify/playback-topology 2>/dev/null" | \
  "${SSH[@]}" "$TARGET_HOST" "mkdir -p /etc/nexlify && cat > /etc/nexlify/playback-topology" || true

REMOTE="$("${SSH[@]}" "$SOURCE_HOST" "sed -n '2p' /etc/nexlify/playback-topology 2>/dev/null | tr -d '\r'")"
echo "=== Apply live routing on target (REMOTE_EDGE=${REMOTE:-from env}) ==="
"${SSH[@]}" "$TARGET_HOST" "cd ${ROOT} && rm -f /etc/nginx/sites-enabled/nexlify-panel-demo; LIVE_ROUTING_FORCE=1 REMOTE_EDGE=${REMOTE} bash scripts/restore-live-proxy.sh"

if "${SSH[@]}" "$SOURCE_HOST" "test -f /etc/nexlify/live-routing.lock"; then
  "${SCP[@]}" "${SOURCE_HOST}:/etc/nexlify/live-routing.lock" "${TARGET_HOST}:/etc/nexlify/live-routing.lock"
fi

echo "=== nginx + pm2 on target ==="
"${SSH[@]}" "$TARGET_HOST" "nginx -t && (systemctl reload nginx || service nginx reload)"
"${SSH[@]}" "$TARGET_HOST" "cd ${ROOT} && pm2 reload ecosystem.config.cjs --update-env || pm2 reload all --update-env"

echo "=== Done sync-panel-host.sh ==="
