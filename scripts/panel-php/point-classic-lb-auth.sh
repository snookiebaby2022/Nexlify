#!/usr/bin/env bash
# Point classic-lb live-auth at Main nginx (PHP panel) instead of Next :13000.
set -euo pipefail
ENV_FILE="${NEXLIFY_LB_ENV:-/etc/nexlify-lb/lb.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi
# Prefer loopback Main :80 so auth hits PHP-FPM snippet
if grep -q '^PANEL_URL=' "$ENV_FILE"; then
  sed -i 's|^PANEL_URL=.*|PANEL_URL=http://127.0.0.1|' "$ENV_FILE"
else
  echo 'PANEL_URL=http://127.0.0.1' >> "$ENV_FILE"
fi
# Ensure internal secret present (copy from panel if empty)
if ! grep -qE '^PANEL_INTERNAL_SECRET=.+' "$ENV_FILE"; then
  SEC="$(grep '^PANEL_INTERNAL_SECRET=' /etc/nexlify-panel/panel.env 2>/dev/null | cut -d= -f2- || true)"
  [ -n "$SEC" ] && echo "PANEL_INTERNAL_SECRET=${SEC}" >> "$ENV_FILE"
fi
echo "LB_PANEL_URL=$(grep '^PANEL_URL=' "$ENV_FILE")"
# No service restart required — PHP reads env per request; clear redis auth cache optional
redis-cli -n 0 KEYS 'lb:auth:*' 2>/dev/null | xargs -r redis-cli -n 0 DEL >/dev/null 2>&1 || true
echo "CLASSIC_LB_AUTH→PHP_OK"
