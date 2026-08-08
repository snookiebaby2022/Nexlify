#!/usr/bin/env bash
# Reset panel admin password (sync DB with install-credentials or ADMIN_PASS).
set -euo pipefail
cd "$(dirname "$0")/.."

CREDS="/root/nexlify/install-credentials"
PASS="${ADMIN_PASS:-}"

if [ -z "$PASS" ] && [ -f "$CREDS" ]; then
  PASS="$(grep '^admin_password=' "$CREDS" | head -1 | cut -d= -f2- || true)"
fi

if [ -z "$PASS" ]; then
  echo "Usage: ADMIN_PASS='your-password' bash scripts/reset-panel-admin.sh"
  echo "Or ensure $CREDS contains admin_password=..."
  exit 1
fi

echo "==> Resetting admin password in database"
set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" .env 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}
set_kv INSTALL_ADMIN_PASSWORD "$PASS"
ADMIN_PASS="$PASS" node scripts/set-admin-password.cjs

echo "==> Verifying bcrypt hash"
node scripts/verify-panel-admin-login.cjs "$PASS"

echo "==> Done. Login at http://$(grep '^PANEL_PRIMARY_DOMAIN=' .env | cut -d= -f2-)/login"
echo "    Username: admin"
echo "    Password: (the value you set)"
