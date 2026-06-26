#!/usr/bin/env bash
# Fix login redirects on HTTP + IP installs — panel on port 80 directly (no :3000).
set -euo pipefail
cd "$(dirname "$0")/.."
PANEL_DIR="$(pwd)"

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

DOMAIN="$(read_env PANEL_PRIMARY_DOMAIN)"
export DOMAIN
if [ -f scripts/panel-port-config.sh ]; then
  # shellcheck source=scripts/panel-port-config.sh
  . scripts/panel-port-config.sh
fi

echo "==> Panel port mode: $([ "${NEXLIFY_USE_NGINX:-1}" = "0" ] && echo 'direct :80' || echo 'nginx → :13000')"
bash scripts/ensure-panel-env.sh

if [[ "${DOMAIN:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  set_kv PORT "${NEXLIFY_PANEL_LISTEN_PORT:-80}"
  set_kv PANEL_PORT "${NEXLIFY_PANEL_LISTEN_PORT:-80}"
  set_kv PANEL_BIND_HOST "${NEXLIFY_PANEL_BIND_HOST:-0.0.0.0}"
  set_kv PANEL_BEHIND_NGINX "${NEXLIFY_PANEL_BEHIND_NGINX:-0}"
  set_kv PANEL_PUBLIC_PORT 80
  set_kv PANEL_ASSUME_PROXY_SSL 0
  set_kv NEXT_PUBLIC_SERVER_URL "http://${DOMAIN}"
  set_kv NEXT_PUBLIC_WEBSITE_URL "http://${DOMAIN}"
  if command -v systemctl >/dev/null 2>&1; then
    echo "==> Stopping nginx so panel can use port 80"
    systemctl stop nginx 2>/dev/null || true
    systemctl disable nginx 2>/dev/null || true
  fi
fi

CREDS="/root/nexlify/install-credentials"
CREDS_PASS=""
if [ -f "$CREDS" ]; then
  CREDS_PASS="$(grep '^admin_password=' "$CREDS" | head -1 | cut -d= -f2- || true)"
  if [ -n "$CREDS_PASS" ]; then
    echo "==> Syncing admin password from install credentials"
    set_kv INSTALL_ADMIN_PASSWORD "$CREDS_PASS"
    ADMIN_PASS="$CREDS_PASS" node scripts/set-admin-password.cjs
  fi
fi

if grep -q '^NEXLIFY_LICENSE_KEY=' .env; then
  echo "==> Syncing license env for middleware"
  node scripts/sync-license-env.mjs || true
fi

echo "==> Rebuilding panel"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
npm run build

echo "==> Restarting PM2"
bash scripts/pm2-start.sh

PORT_NOW="$(read_env PORT)"
PORT_NOW="${PORT_NOW:-80}"
if [ -f scripts/verify-install-smoke.sh ]; then
  bash scripts/verify-install-smoke.sh || echo "WARN: smoke check failed — see output above"
fi

if [ -n "$CREDS_PASS" ] && [ -f scripts/verify-install-login.sh ]; then
  echo "==> Verifying admin login"
  chmod +x scripts/verify-install-login.sh
  ADMIN_PASS="$CREDS_PASS" bash scripts/verify-install-login.sh || echo "WARN: login verify failed"
fi

echo ""
echo "Done. Open: http://${DOMAIN:-127.0.0.1}/login (no port number in the URL)"
