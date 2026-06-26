#!/usr/bin/env bash
# Canonical production env — IP installs use port 80 direct; domains use nginx → 127.0.0.1:13000.
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

read_env() {
  grep "^${1}=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

is_ip_host() {
  [[ "${1:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

panel_https_active() {
  local primary="$1"
  is_ip_host "$primary" && return 1
  [ -f "/etc/letsencrypt/live/${primary}/fullchain.pem" ]
}

PRIMARY="$(read_env PANEL_PRIMARY_DOMAIN)"
[ -z "$PRIMARY" ] && PRIMARY="${PANEL_PRIMARY_DOMAIN:-panel.nexlify.live}"

WEBSITE_PORT="$(read_env WEBSITE_PORT)"
[ -z "$WEBSITE_PORT" ] && WEBSITE_PORT="13001"

set_kv WEBSITE_PORT "${WEBSITE_PORT}"
set_kv STREAM_HTTP_PORT 8080
set_kv PANEL_PRIMARY_DOMAIN "${PRIMARY}"
set_kv PANEL_COOKIE_SECURE 0
set_kv NEXLIFY_LICENSE_COOKIE_SECURE 0

# Never expose internal upstream ports in browser URLs.
PANEL_PUB="$(read_env PANEL_PUBLIC_PORT)"
case "$PANEL_PUB" in
  3000|3001|13000|13001) set_kv PANEL_PUBLIC_PORT 80 ;;
esac

if is_ip_host "$PRIMARY"; then
  set_kv PORT 80
  set_kv PANEL_PORT 80
  set_kv PANEL_BIND_HOST 0.0.0.0
  set_kv PANEL_BEHIND_NGINX 0
  set_kv PANEL_ASSUME_PROXY_SSL 0
  set_kv PANEL_PUBLIC_PORT 80
  set_kv NEXT_PUBLIC_SERVER_URL "http://${PRIMARY}"
  set_kv NEXT_PUBLIC_WEBSITE_URL "http://${PRIMARY}"
  echo "Panel env: HTTP IP=${PRIMARY} — direct on port 80 (no :3000)"
elif panel_https_active "$PRIMARY"; then
  set_kv PORT 13000
  set_kv PANEL_PORT 13000
  set_kv PANEL_BIND_HOST 127.0.0.1
  set_kv PANEL_BEHIND_NGINX 1
  set_kv PANEL_ASSUME_PROXY_SSL 1
  set_kv PANEL_PUBLIC_PORT 443
  set_kv NEXT_PUBLIC_SERVER_URL "https://${PRIMARY}"
  set_kv NEXT_PUBLIC_WEBSITE_URL "https://${PRIMARY}"
  echo "Panel env: HTTPS domain=${PRIMARY} (nginx → 127.0.0.1:13000)"
else
  set_kv PORT 13000
  set_kv PANEL_PORT 13000
  set_kv PANEL_BIND_HOST 127.0.0.1
  set_kv PANEL_BEHIND_NGINX 1
  set_kv PANEL_ASSUME_PROXY_SSL 0
  set_kv PANEL_PUBLIC_PORT 80
  set_kv NEXT_PUBLIC_SERVER_URL "http://${PRIMARY}"
  set_kv NEXT_PUBLIC_WEBSITE_URL "http://${PRIMARY}"
  echo "Panel env: HTTP domain=${PRIMARY} (nginx → 127.0.0.1:13000)"
fi

# Migrate legacy 3000/3001 listen ports on domain installs only.
if ! is_ip_host "$PRIMARY"; then
  PANEL_LISTEN="$(read_env PORT)"
  case "$PANEL_LISTEN" in
    3000|3001)
      set_kv PORT 13000
      set_kv PANEL_PORT 13000
      ;;
  esac
fi
