#!/usr/bin/env bash
# Persist correct IP/domain env before any panel build (prevents client-side JS crash on IP installs).
# Called by apply-panel-fast-update, fix-customer-panel, and fix-panel-ip-login.
set -euo pipefail
cd "$(dirname "$0")/.."

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

detect_public_ip() {
  if [ -n "${DOMAIN:-}" ] && is_ip_host "$DOMAIN"; then
    echo "$DOMAIN"
    return 0
  fi
  local from_env
  from_env="$(read_env PANEL_PRIMARY_DOMAIN)"
  if is_ip_host "$from_env"; then
    echo "$from_env"
    return 0
  fi
  local ip
  ip="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 8 https://ifconfig.me 2>/dev/null || true)"
  if is_ip_host "$ip"; then
    echo "$ip"
    return 0
  fi
  return 1
}

is_ip_install() {
  local primary behind port
  primary="$(read_env PANEL_PRIMARY_DOMAIN)"
  behind="$(read_env PANEL_BEHIND_NGINX)"
  port="$(read_env PORT)"
  if is_ip_host "$primary"; then return 0; fi
  if [ "$behind" = "0" ] && [ "$port" = "80" ]; then return 0; fi
  if [ -f /root/nexlify/install-credentials ] && grep -q '^install_mode=ip' /root/nexlify/install-credentials 2>/dev/null; then
    return 0
  fi
  return 1
}

if ! is_ip_install; then
  exit 0
fi

IP="$(detect_public_ip || true)"
if ! is_ip_host "$IP"; then
  echo "ensure-customer-ip-env: could not detect public IP — skip" >&2
  exit 0
fi

touch .env
sed -i 's/\r$//' .env 2>/dev/null || true
set_kv PANEL_PRIMARY_DOMAIN "$IP"
set_kv PORT 80
set_kv PANEL_PORT 80
set_kv PANEL_BIND_HOST 0.0.0.0
set_kv PANEL_BEHIND_NGINX 0
set_kv PANEL_PUBLIC_PORT 80
set_kv PANEL_ASSUME_PROXY_SSL 0
set_kv NEXT_PUBLIC_SERVER_URL "http://${IP}"
set_kv NEXT_PUBLIC_WEBSITE_URL "http://${IP}"

if [ -x scripts/ensure-panel-env.sh ]; then
  bash scripts/ensure-panel-env.sh
fi

echo "ensure-customer-ip-env: OK (IP=${IP}, NEXT_PUBLIC_SERVER_URL=http://${IP})"
