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
TMP="$(mktemp)"
ENV_BACKUP=""
if [ -f "$ENV_FILE" ]; then
  ENV_BACKUP="${ENV_FILE}.backup.$(date +%s)"
  cp "$ENV_FILE" "$ENV_BACKUP"
fi

read_prev() {
  local key="$1"
  local f val
  for f in $(ls -t "${ENV_FILE}.backup."* 2>/dev/null | head -5); do
    val="$(grep -m1 "^${key}=" "$f" 2>/dev/null | head -1 || true)"
    if [ -n "$val" ]; then
      echo "$val"
      return 0
    fi
  done
  return 0
}

# Never copy panel DATABASE_URL — marketing uses nexlify_marketing (see setup-marketing-database.sh)
copy_kv() {
  local key="$1"
  [ "$key" = "DATABASE_URL" ] && return 0
  [ -n "$PANEL_ENV" ] || return 0
  grep -E "^${key}=" "$PANEL_ENV" 2>/dev/null | head -1 >> "$TMP" || true
}

: > "$TMP"

for key in \
  DATABASE_URL JWT_SECRET STRIPE_SECRET_KEY BILLING_WEBHOOK_SECRET \
  PANEL_API_SECRET NEXLIFY_PANEL_API_SECRET ADMIN_EMAIL ADMIN_PASSWORD \
  SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM WHMCS_API_SECRET; do
  copy_kv "$key"
done

cat >> "$TMP" << 'DEFAULTS'
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://nexlify.live
NEXT_PUBLIC_WEBSITE_URL=https://nexlify.live
NEXT_PUBLIC_PANEL_URL=https://panel.nexlify.live
NEXLIFY_LICENSE_API_URL=http://127.0.0.1:8787
LICENSE_KEY_FILE=/var/www/nexlify/.license-keys/private.pem
DEFAULTS

# First occurrence wins (panel secrets before defaults)
awk -F= '{
  key=$1
  if (!seen[key]++) print
}' "$TMP" > "$ENV_FILE"

# Preserve marketing-only secrets if panel did not supply them
for key in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM STRIPE_SECRET_KEY BILLING_WEBHOOK_SECRET ADMIN_EMAIL ADMIN_PASSWORD; do
  if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    prev="$(read_prev "$key")"
    [ -n "$prev" ] && echo "$prev" >> "$ENV_FILE"
  fi
done

rm -f "$TMP"
chmod 600 "$ENV_FILE"

echo "Wrote $ENV_FILE ($(grep -cE '^[A-Z_]+=' "$ENV_FILE" || echo 0) keys)"

# Marketing must use nexlify_marketing — never copy panel DATABASE_URL from copy_kv above
if ! grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null; then
  echo "-> Setting DATABASE_URL for nexlify_marketing..."
  bash "$(dirname "$0")/ensure-marketing-database-url.sh" "$MARKETING"
fi

if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  echo "DATABASE_URL: OK ($(grep '^DATABASE_URL=' "$ENV_FILE" | sed 's|.*@.*/||; s/"//g'))"
else
  echo "DATABASE_URL: MISSING — run: bash scripts/ensure-marketing-database-url.sh"
fi

grep -E '^SMTP_HOST=' "$ENV_FILE" >/dev/null && grep -E '^SMTP_PASS=' "$ENV_FILE" >/dev/null \
  && echo "SMTP: configured" || echo "SMTP: not set — run: bash scripts/configure-marketing-smtp-stripe.sh"
if grep -E '^STRIPE_SECRET_KEY="?sk_' "$ENV_FILE" >/dev/null; then
  echo "Stripe: configured"
else
  echo "Stripe: not set — run: bash scripts/configure-marketing-smtp-stripe.sh (needed after Sep 1 promo)"
fi

grep -E '^[A-Z_]+=' "$ENV_FILE" | cut -d= -f1 | sort -u
echo "Done."
