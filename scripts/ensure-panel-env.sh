#!/usr/bin/env bash
# Canonical production env for panel behind nginx (127.0.0.1:3000).
set -euo pipefail
cd "$(dirname "$0")/.."
touch .env
sed -i 's/\r$//' .env 2>/dev/null || true

set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" .env 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}

PANEL_PORT="${PANEL_PORT:-3000}"
PRIMARY="${PANEL_PRIMARY_DOMAIN:-panel.nexlify.live}"

set_kv PORT "${PANEL_PORT}"
set_kv PANEL_PORT "${PANEL_PORT}"
set_kv WEBSITE_PORT 3001
set_kv STREAM_HTTP_PORT 3001
set_kv PANEL_BEHIND_NGINX 1
set_kv PANEL_BIND_HOST 127.0.0.1
set_kv PANEL_ASSUME_PROXY_SSL 1
set_kv PANEL_PUBLIC_PORT 443
set_kv PANEL_PRIMARY_DOMAIN "${PRIMARY}"
set_kv NEXT_PUBLIC_SERVER_URL "https://${PRIMARY}"
set_kv NEXT_PUBLIC_WEBSITE_URL "https://${PRIMARY}"

echo "Panel env: PORT=${PANEL_PORT} bind=127.0.0.1 domain=${PRIMARY}"
