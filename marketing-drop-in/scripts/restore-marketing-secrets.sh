#!/usr/bin/env bash
# Restore SMTP + Stripe from latest .env backup after deploy overwrote them.
# Run: bash /var/www/nexlify/scripts/restore-marketing-secrets.sh

set -euo pipefail
MARKETING="${1:-/var/www/nexlify}"
ENV="$MARKETING/.env"
BACKUP="$(ls -t "$MARKETING"/.env.backup.* 2>/dev/null | head -1 || true)"

if [ -z "$BACKUP" ]; then
  echo "No .env backup found under $MARKETING"
  exit 1
fi

echo "Restoring from: $BACKUP"
touch "$ENV"
for key in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM STRIPE_SECRET_KEY ADMIN_EMAIL; do
  line="$(grep -m1 "^${key}=" "$BACKUP" 2>/dev/null || true)"
  if [ -n "$line" ]; then
    grep -v "^${key}=" "$ENV" > "${ENV}.tmp" 2>/dev/null || true
    mv "${ENV}.tmp" "$ENV"
    echo "$line" >> "$ENV"
    echo "  restored $key"
  fi
done
chmod 600 "$ENV"
pm2 restart nexlify-web --update-env 2>/dev/null || true
echo "Done. Test: npx tsx scripts/test-marketing-smtp.ts YOUR@EMAIL.com"
