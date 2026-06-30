#!/usr/bin/env bash
# Required env for nexlify-web (https://nexlify.live) — JWT, DB, admin login.
set -euo pipefail

MARKETING="${1:-/var/www/nexlify}"
PANEL="${PANEL_ROOT:-/home/nexlify-panel}"

set_kv() {
  local file="$1" key="$2" val="$3"
  touch "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

read_env() {
  grep "^${2}=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

ENV="$MARKETING/.env"
PANEL_ENV="$PANEL/.env"
touch "$ENV"
sed -i 's/\r$//' "$ENV" 2>/dev/null || true

PORT="${MARKETING_PORT:-13001}"
set_kv "$ENV" PORT "$PORT"
set_kv "$ENV" HOSTNAME "127.0.0.1"

DB_URL="$(read_env "$ENV" DATABASE_URL)"
if [ -z "$DB_URL" ]; then
  mkdir -p "$MARKETING/data"
  set_kv "$ENV" DATABASE_URL "file:./data/nexlify.db"
fi

JWT="$(read_env "$ENV" JWT_SECRET)"
if [ -z "$JWT" ] || [ "${#JWT}" -lt 32 ]; then
  PANEL_JWT="$(read_env "$PANEL_ENV" JWT_SECRET)"
  if [ -n "$PANEL_JWT" ] && [ "${#PANEL_JWT}" -ge 32 ]; then
    set_kv "$ENV" JWT_SECRET "$PANEL_JWT"
  else
    set_kv "$ENV" JWT_SECRET "$(openssl rand -hex 32)"
  fi
fi

if [ -f "$PANEL/scripts/sync-marketing-env.py" ]; then
  python3 "$PANEL/scripts/sync-marketing-env.py" 2>/dev/null || true
fi

if [ -f "$PANEL/scripts/sync-marketing-admin.cjs" ]; then
  cd "$MARKETING"
  NEXLIFY_MARKETING_PATH="$MARKETING" node "$PANEL/scripts/sync-marketing-admin.cjs" || true
fi

PANEL_PORT="$(read_env "$PANEL_ENV" PORT)"
[ -z "$PANEL_PORT" ] && PANEL_PORT="$(read_env "$PANEL_ENV" PANEL_PORT)"
[ -z "$PANEL_PORT" ] && PANEL_PORT="13000"
set_kv "$ENV" PANEL_INTERNAL_URL "http://127.0.0.1:${PANEL_PORT}"
set_kv "$ENV" PANEL_INTERNAL_HOSTS "panel.nexlify.live,panel.demo.nexlify.live"

echo "ensure-marketing-env: OK ($ENV)"
