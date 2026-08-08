#!/usr/bin/env bash
# Run everything on vendor VPS after marketing deploy. Called automatically by vps-full-update.sh.
set -uo pipefail

PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
ENV="$MARKETING/.env"

echo ""
echo "=== Nexlify post-deploy (auto) ==="

# 1) Restore SMTP/Stripe from latest backup (deploy must not wipe secrets)
BACKUP="$(ls -t "$MARKETING"/.env.backup.* 2>/dev/null | head -1 || true)"
if [ -n "$BACKUP" ] && [ -f "$ENV" ]; then
  restored=0
  touch "$ENV"
  for key in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM STRIPE_SECRET_KEY ADMIN_EMAIL; do
    if ! grep -q "^${key}=" "$ENV" 2>/dev/null; then
      line="$(grep -m1 "^${key}=" "$BACKUP" 2>/dev/null || true)"
      if [ -n "$line" ]; then
        grep -v "^${key}=" "$ENV" > "${ENV}.merge" 2>/dev/null || true
        mv "${ENV}.merge" "$ENV"
        echo "$line" >> "$ENV"
        restored=$((restored + 1))
      fi
    fi
  done
  chmod 600 "$ENV"
  [ "$restored" -gt 0 ] && echo "  Restored $restored secret(s) from backup" && pm2 restart nexlify-web --update-env 2>/dev/null || true
fi

# 2) Publish panel tarball if panel exists
if [ -f "$PANEL/scripts/publish-panel-release.sh" ]; then
  echo "-> Publish panel tarball"
  (cd "$PANEL" && bash scripts/publish-panel-release.sh) 2>&1 | tail -5
fi

# 3) Install helpers on /root
for s in nexlify-full-platform-audit.sh vps-do-everything.sh restore-marketing-secrets.sh; do
  [ -f "$MARKETING/scripts/$s" ] && cp -f "$MARKETING/scripts/$s" "/root/$s" && chmod +x "/root/$s"
done

# 4) Audit
if [ -x /root/nexlify-full-platform-audit.sh ]; then
  echo ""
  bash /root/nexlify-full-platform-audit.sh || true
fi

echo ""
echo "=== Post-deploy complete ==="
