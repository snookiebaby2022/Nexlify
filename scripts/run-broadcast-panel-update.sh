#!/usr/bin/env bash
# Broadcast panel update to registered customer panels (run on vendor / nexlify.live host).
set -euo pipefail

MKT="${NEXLIFY_MARKETING_PATH:-/var/www/nexlify}"
PANEL="${NEXLIFY_PANEL_PATH:-/home/nexlify-panel}"

pick_secret() {
  local f key val
  for f in "$MKT/.env" "$PANEL/.env"; do
    [ -f "$f" ] || continue
    for key in PANEL_API_SECRET NEXLIFY_PANEL_API_SECRET; do
      val="$(grep -E "^${key}=" "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true)"
      val="${val#\"}"; val="${val%\"}"
      val="${val#\'}"; val="${val%\'}"
      if [ -n "$val" ]; then
        printf '%s' "$val"
        return 0
      fi
    done
  done
  return 1
}

SECRET="$(pick_secret || true)"
if [ -z "${SECRET:-}" ]; then
  echo "ERROR: PANEL_API_SECRET / NEXLIFY_PANEL_API_SECRET not found in $MKT/.env or $PANEL/.env" >&2
  exit 1
fi

# Ensure marketing .env has PANEL_API_SECRET for future deploys
if [ -f "$MKT/.env" ] && ! grep -qE '^PANEL_API_SECRET=.+' "$MKT/.env"; then
  printf '\nPANEL_API_SECRET=%s\n' "$SECRET" >> "$MKT/.env"
  echo "Wrote PANEL_API_SECRET into $MKT/.env"
fi

export PANEL_API_SECRET="$SECRET"
export NEXLIFY_PANEL_API_SECRET="$SECRET"

set -a
# shellcheck disable=SC1091
. <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$MKT/.env" | grep -v -- '-----' | sed 's/\r$//')
set +a
export PANEL_API_SECRET="$SECRET"
export NEXLIFY_PANEL_API_SECRET="$SECRET"

SCRIPT="$MKT/scripts/broadcast-panel-update.ts"
if [ ! -f "$SCRIPT" ]; then
  echo "ERROR: missing $SCRIPT" >&2
  exit 1
fi

cd "$MKT"
npx tsx "$SCRIPT"
