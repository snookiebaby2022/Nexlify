#!/usr/bin/env bash
# Permanent port fix: sync .env, nginx stream edge, and UFW from current panel config.
# Safe to run after install, deploy, or Admin → Settings → Server & port changes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[sync-panel-ports] Ensuring panel .env…"
bash scripts/ensure-panel-env.sh

set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a

BEHIND="${PANEL_BEHIND_NGINX:-1}"
USE_NGINX="${NEXLIFY_USE_NGINX:-1}"

if [ "$BEHIND" = "1" ] || [ "$BEHIND" = "true" ] || [ "$USE_NGINX" = "1" ]; then
  if command -v nginx >/dev/null 2>&1; then
    echo "[sync-panel-ports] Installing / refreshing nginx stream edge…"
    bash scripts/install-nginx-stream-edge.sh
  else
    echo "[sync-panel-ports] WARN: nginx not installed — stream edge vhost skipped"
  fi
else
  echo "[sync-panel-ports] Direct port 80 mode — no separate stream edge vhost"
  rm -f /etc/nginx/conf.d/nexlify-stream-edge.conf 2>/dev/null || true
  if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
  fi
fi

echo "[sync-panel-ports] Opening firewall ports…"
bash scripts/nexlify-firewall-ports.sh

if command -v nginx >/dev/null 2>&1; then
  echo "[sync-panel-ports] Refreshing RTMP vhost…"
  bash scripts/install-nginx-rtmp.sh || echo "[sync-panel-ports] WARN: RTMP install skipped"
  echo "[sync-panel-ports] Refreshing extra HTTPS listeners…"
  bash scripts/install-nginx-https-extra-ports.sh || echo "[sync-panel-ports] WARN: extra HTTPS skipped"
fi

if [ -f scripts/verify-panel-ports.sh ]; then
  bash scripts/verify-panel-ports.sh || echo "[sync-panel-ports] WARN: port verification reported issues (see above)"
fi

echo "[sync-panel-ports] Complete."
