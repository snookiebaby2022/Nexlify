#!/usr/bin/env bash
# Quick fix when vps-fix-everything passes everything except tarball download.
# Run on vendor VPS as root: bash scripts/fix-tarball-publish-now.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify}"
TARBALL="$MARKETING/public/downloads/nexlify-panel.tar.gz"
NGINX_SITE="/etc/nginx/sites-available/nexlify.live"

echo "==> fix-tarball-publish-now"

if [ -f "$PANEL/nginx/nexlify.live.conf" ]; then
  cp -f "$PANEL/nginx/nexlify.live.conf" "$NGINX_SITE"
  nginx -t && systemctl reload nginx
  echo "   nginx config updated"
fi

if [ ! -s "$TARBALL" ] || [ "$(wc -c < "$TARBALL" | tr -d '[:space:]')" -lt 500000 ]; then
  echo "-> Rebuilding tarball ..."
  if [ -f "$PANEL/scripts/publish-panel-release.sh" ]; then
    SKIP_INSTALL_SCRIPT_PUBLISH=1 bash "$PANEL/scripts/publish-panel-release.sh"
  else
    echo "ERROR: missing $PANEL/scripts/publish-panel-release.sh — run vps-fix-everything first" >&2
    exit 1
  fi
fi

mkdir -p "$MARKETING/public/downloads"
chmod -R a+rX "$MARKETING/public/downloads"
chown -R www-data:www-data "$MARKETING/public/downloads" 2>/dev/null || chmod -R a+rX "$MARKETING/public/downloads"

HTTP="$(curl -fsSk -o /dev/null -w '%{http_code}' 'https://127.0.0.1/downloads/nexlify-panel.tar.gz' -H 'Host: nexlify.live' 2>/dev/null || echo 000)"
SIZE="$(du -h "$TARBALL" | cut -f1)"
if [ "$HTTP" = "200" ]; then
  echo "OK  tarball HTTP 200 ($SIZE) — https://nexlify.live/downloads/nexlify-panel.tar.gz"
else
  echo "FAIL tarball HTTP $HTTP (file on disk: $SIZE)" >&2
  echo "Check: ls -la $TARBALL && nginx -T | grep -A5 downloads" >&2
  exit 1
fi
