#!/usr/bin/env bash
# Build /var/www/nexlify/.env from panel secrets + marketing defaults.
# Run on VPS: bash scripts/setup-marketing-env.sh
# Never embed PEM keys in .env — use LICENSE_KEY_FILE only.

set -u

MARKETING="${1:-/var/www/nexlify}"

find_panel_env() {
  for p in /home/nexlify-panel/.env /opt/nexlify-panel/.env; do
    [ -f "$p" ] && echo "$p" && return 0
  done
  return 1
}

echo "=== Marketing .env setup ==="
echo "Target: $MARKETING"

PANEL_ENV="$(find_panel_env)" || PANEL_ENV=""
if [ -z "$PANEL_ENV" ]; then
  echo "WARNING: panel .env not found — only writing marketing defaults"
fi

mkdir -p "$MARKETING"
ENV_FILE="$MARKETING/.env"
[ -f "$ENV_FILE" ] && cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%s)"

copy_kv() {
  local key="$1"
  [ -n "$PANEL_ENV" ] || return 0
  grep -E "^${key}=" "$PANEL_ENV" 2>/dev/null | head -1
}

{
  copy_kv DATABASE_URL
  copy_kv JWT_SECRET
  copy_kv STRIPE_SECRET_KEY
  copy_kv BILLING_WEBHOOK_SECRET
  copy_kv PANEL_API_SECRET
  copy_kv NEXLIFY_PANEL_API_SECRET
  copy_kv ADMIN_EMAIL
  copy_kv ADMIN_PASSWORD
  copy_kv SMTP_HOST
  copy_kv SMTP_PORT
  copy_kv SMTP_USER
  copy_kv SMTP_PASS
  copy_kv SMTP_FROM
  copy_kv WHMCS_API_SECRET

  cat << 'DEFAULTS'
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://nexlify.live
NEXT_PUBLIC_WEBSITE_URL=https://nexlify.live
NEXT_PUBLIC_PANEL_URL=https://panel.nexlify.live
NEXLIFY_LICENSE_API_URL=http://127.0.0.1:8787
LICENSE_KEY_FILE=/var/www/nexlify/.license-keys/private.pem
DEFAULTS
} | awk -F= '!seen[$1]++' > "$ENV_FILE"

chmod 600 "$ENV_FILE"
echo "Wrote $ENV_FILE ($(grep -cE '^[A-Z_]+=' "$ENV_FILE" || echo 0) keys)"
grep -E '^[A-Z_]+=' "$ENV_FILE" | cut -d= -f1 | sort -u
echo "Done."
