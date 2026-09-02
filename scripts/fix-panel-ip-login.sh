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

is_ip_host() {
  [[ "${1:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

install_ip_nginx_vhost() {
  is_ip_host "${1:-}" || return 0
  [ "${SKIP_NGINX:-0}" = "0" ] || return 0
  [ "${NEXLIFY_USE_NGINX:-1}" = "1" ] || return 0
  [ -f nginx/panel.nexlify.live-http-only.conf ] || return 0
  mkdir -p /etc/nginx/conf.d /etc/nginx/sites-available /etc/nginx/sites-enabled
  cp -f nginx/nexlify-upstream.conf /etc/nginx/conf.d/nexlify-upstream.conf
  local site="/etc/nginx/sites-available/nexlify-panel-${1}"
  cp -f nginx/panel.nexlify.live-http-only.conf "$site"
  sed -i "s/server_name panel.nexlify.live;/server_name ${1} default_server;/" "$site"
  rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.conf 2>/dev/null || true
  ln -sfn "$site" "/etc/nginx/sites-enabled/nexlify-panel-${1}"
  nginx -t
  systemctl enable nginx 2>/dev/null || true
  systemctl start nginx 2>/dev/null || systemctl reload nginx 2>/dev/null || true
}

# Respect DOMAIN passed from fix-customer-panel.sh (do not overwrite with stale .env).
DOMAIN="${DOMAIN:-$(read_env PANEL_PRIMARY_DOMAIN)}"
if is_ip_host "$DOMAIN"; then
  set_kv PANEL_PRIMARY_DOMAIN "$DOMAIN"
fi
export DOMAIN

if [ -f scripts/ensure-customer-ip-env.sh ]; then
  bash scripts/ensure-customer-ip-env.sh
  DOMAIN="$(read_env PANEL_PRIMARY_DOMAIN)"
  [ -z "$DOMAIN" ] && DOMAIN="${DOMAIN:-$(read_env PANEL_PRIMARY_DOMAIN)}"
  export DOMAIN
fi

if [ -f scripts/panel-port-config.sh ]; then
  # shellcheck source=scripts/panel-port-config.sh
  . scripts/panel-port-config.sh
fi

echo "==> Panel port mode: $([ "${NEXLIFY_USE_NGINX:-1}" = "0" ] && echo 'direct :80' || echo 'nginx → :13000')"
bash scripts/ensure-panel-env.sh

DOMAIN="$(read_env PANEL_PRIMARY_DOMAIN)"
export DOMAIN

echo "==> Ensuring dependencies + Prisma client ..."
if [ -f scripts/ensure-build-deps.sh ]; then
  bash scripts/ensure-build-deps.sh
elif [ -f scripts/ensure-prisma-client.sh ]; then
  bash scripts/ensure-prisma-client.sh
else
  unset DATABASE_URL 2>/dev/null || true
  npx prisma generate
fi

if is_ip_host "${DOMAIN:-}"; then
  set_kv PORT "${NEXLIFY_PANEL_LISTEN_PORT:-13000}"
  set_kv PANEL_PORT "${NEXLIFY_PANEL_LISTEN_PORT:-13000}"
  set_kv PANEL_BIND_HOST "${NEXLIFY_PANEL_BIND_HOST:-127.0.0.1}"
  set_kv PANEL_BEHIND_NGINX "${NEXLIFY_PANEL_BEHIND_NGINX:-1}"
  set_kv PANEL_PUBLIC_PORT 80
  set_kv PANEL_ASSUME_PROXY_SSL 0
  set_kv NEXT_PUBLIC_SERVER_URL "http://${DOMAIN}"
  set_kv NEXT_PUBLIC_WEBSITE_URL "http://${DOMAIN}"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  install_ip_nginx_vhost "$DOMAIN"
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

echo "==> Rebuilding panel (NEXT_PUBLIC_SERVER_URL=$(read_env NEXT_PUBLIC_SERVER_URL))"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
if ! npm run build; then
  echo "ERROR: build failed — restoring previous panel if available ..." >&2
  bash scripts/panel-update-recover.sh --quick 2>/dev/null || bash scripts/panel-update-recover.sh 2>/dev/null || true
  exit 1
fi

echo "==> Preparing standalone static assets"
bash scripts/prepare-standalone.sh
bash scripts/verify-standalone.sh

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

# Verify JS chunks are served (prevents client-side Application error)
VERIFY_UA="${NEXLIFY_VERIFY_UA:-Mozilla/5.0 (compatible; NexlifyInstallVerify/1.0)}"
CHUNK="$(curl -fsS -H "User-Agent: $VERIFY_UA" "http://127.0.0.1:${PORT_NOW}/login" 2>/dev/null | grep -oE '/_next/static/[^"]+\.js' | head -1 || true)"
if [ -n "$CHUNK" ]; then
  CODE="$(curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT_NOW}${CHUNK}" 2>/dev/null || echo 000)"
  if [ "$CODE" != "200" ]; then
    echo "ERROR: JS chunk returned HTTP $CODE — run: bash scripts/vps-repair-standalone.sh" >&2
    exit 1
  fi
  echo "==> JS chunk OK (HTTP 200)"
fi

echo ""
echo "Done. Open: http://${DOMAIN:-127.0.0.1}/login (no port number in the URL)"
