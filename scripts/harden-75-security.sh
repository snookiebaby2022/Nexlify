#!/usr/bin/env bash
# Security hardening for server 75 only. Preserves moviestream/RTMP stack.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/harden-75-host-guard.sh"

PANEL="${PANEL_ROOT:-/opt/nexlify-panel}"
cd "$PANEL"

STAMP=$(date +%Y%m%d-%H%M%S)
SECRETS_FILE="/root/.nexlify-75-secrets-${STAMP}.env"
umask 077

echo "==> Rotating server-75 secrets (saved to $SECRETS_FILE)"
{
  echo "# Nexlify server 75 rotated secrets — $STAMP — chmod 600, do not commit"
  NEW_JWT=$(openssl rand -hex 32)
  NEW_INTERNAL=$(openssl rand -hex 32)
  NEW_CRON=$(openssl rand -hex 32)
  NEW_BILLING=$(openssl rand -hex 32)
  NEW_ENC=$(openssl rand -hex 32)
  NEW_DB=$(openssl rand -hex 16)
  echo "JWT_SECRET=$NEW_JWT"
  echo "PANEL_INTERNAL_SECRET=$NEW_INTERNAL"
  echo "CRON_SECRET=$NEW_CRON"
  echo "BILLING_WEBHOOK_SECRET=$NEW_BILLING"
  echo "ENCRYPTION_AT_REST_KEY=$NEW_ENC"
  echo "POSTGRES_PASSWORD=$NEW_DB"
} > "$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"

set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" .env 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}

# shellcheck disable=SC1090
source "$SECRETS_FILE"
set_kv JWT_SECRET "$JWT_SECRET"
set_kv PANEL_INTERNAL_SECRET "$PANEL_INTERNAL_SECRET"
set_kv CRON_SECRET "$CRON_SECRET"
set_kv BILLING_WEBHOOK_SECRET "$BILLING_WEBHOOK_SECRET"
set_kv ENCRYPTION_AT_REST_KEY "$ENCRYPTION_AT_REST_KEY"

echo "==> Rotate PostgreSQL nexlify user password"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
ALTER USER nexlify WITH PASSWORD '${POSTGRES_PASSWORD}';
SQL
OLD_DB=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
NEW_DB_URL=$(node -e "
const u = new URL(process.argv[1]);
u.password = process.argv[2];
console.log(u.toString());
" "$OLD_DB" "$POSTGRES_PASSWORD")
set_kv DATABASE_URL "$NEW_DB_URL"

echo "==> File permissions"
chmod 600 .env
chmod 644 ecosystem.config.cjs 2>/dev/null || true
find scripts -type f -name '*.sh' -exec chmod 755 {} + 2>/dev/null || true
chmod 755 ecosystem.config.cjs 2>/dev/null || true

echo "==> Stop public license server on :8787"
pm2 delete nexlify-license 2>/dev/null || true
pm2 save

echo "==> Disable license server in PM2 (vendor-only, opt-in)"
grep -q '^NEXLIFY_ENABLE_LICENSE_SERVER=' .env && sed -i 's/^NEXLIFY_ENABLE_LICENSE_SERVER=.*/NEXLIFY_ENABLE_LICENSE_SERVER=0/' .env || echo 'NEXLIFY_ENABLE_LICENSE_SERVER=0' >> .env

echo "==> Firewall (ufw) — preserve SSH, HTTP/S, RTMP, moviestream"
if command -v ufw >/dev/null 2>&1; then
  ufw --force reset || true
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp comment 'SSH'
  ufw allow 80/tcp comment 'HTTP'
  ufw allow 443/tcp comment 'HTTPS'
  ufw allow 8080/tcp comment 'IPTV edge'
  ufw allow 25461/tcp comment 'IPTV alt port'
  ufw allow 1935/tcp comment 'RTMP moviestream'
  ufw allow 3001/tcp comment 'moviestream app'
  ufw --force enable
  ufw status verbose || true
else
  echo "ufw not installed — skip firewall"
fi

echo "==> Ensure SSH key-only (keep existing authorized_keys)"
if [ -f /etc/ssh/sshd_config ]; then
  cp -a /etc/ssh/sshd_config "/etc/ssh/sshd_config.bak-${STAMP}"
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  systemctl reload sshd 2>/dev/null || service ssh reload 2>/dev/null || true
fi

echo "security_harden_ok secrets=$SECRETS_FILE"
