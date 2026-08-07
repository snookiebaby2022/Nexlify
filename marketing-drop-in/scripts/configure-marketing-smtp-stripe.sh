#!/usr/bin/env bash
# Configure SMTP + Stripe on the marketing site (.env).
#
# Usage (interactive):
#   bash scripts/configure-marketing-smtp-stripe.sh
#
# Usage (non-interactive):
#   bash scripts/configure-marketing-smtp-stripe.sh \
#     --smtp-host smtp.gmail.com --smtp-port 587 \
#     --smtp-user noreply@nexlify.live --smtp-pass 'app-password' \
#     --smtp-from 'Nexlify <noreply@nexlify.live>' \
#     --stripe-key sk_live_xxxx
#
# Copy SMTP/Stripe from panel .env if present:
#   bash scripts/configure-marketing-smtp-stripe.sh --from-panel

set -euo pipefail

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
ENV_FILE="$MARKETING/.env"

find_panel_env() {
  for p in /home/nexlify-panel/.env /opt/nexlify-panel/.env; do
    [ -f "$p" ] && echo "$p" && return 0
  done
  return 1
}

read_env_val() {
  local file="$1" key="$2"
  grep -m1 "^${key}=" "$file" 2>/dev/null | sed "s/^${key}=//" | tr -d '"' | tr -d "'" || true
}

set_env_val() {
  local key="$1" val="$2"
  touch "$ENV_FILE"
  grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp" 2>/dev/null || true
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
  printf '%s="%s"\n' "$key" "$val" >> "$ENV_FILE"
}

FROM_PANEL=0
SMTP_HOST="" SMTP_PORT="" SMTP_USER="" SMTP_PASS="" SMTP_FROM="" STRIPE_KEY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --from-panel) FROM_PANEL=1; shift ;;
    --smtp-host) SMTP_HOST="$2"; shift 2 ;;
    --smtp-port) SMTP_PORT="$2"; shift 2 ;;
    --smtp-user) SMTP_USER="$2"; shift 2 ;;
    --smtp-pass) SMTP_PASS="$2"; shift 2 ;;
    --smtp-from) SMTP_FROM="$2"; shift 2 ;;
    --stripe-key) STRIPE_KEY="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

echo "=== Configure marketing SMTP + Stripe ==="
echo "Target: $ENV_FILE"
echo ""

if [ "$FROM_PANEL" = "1" ]; then
  PANEL_ENV="$(find_panel_env || true)"
  if [ -n "$PANEL_ENV" ]; then
    echo "Reading from panel: $PANEL_ENV"
    [ -z "$SMTP_HOST" ] && SMTP_HOST="$(read_env_val "$PANEL_ENV" SMTP_HOST)"
    [ -z "$SMTP_PORT" ] && SMTP_PORT="$(read_env_val "$PANEL_ENV" SMTP_PORT)"
    [ -z "$SMTP_USER" ] && SMTP_USER="$(read_env_val "$PANEL_ENV" SMTP_USER)"
    [ -z "$SMTP_PASS" ] && SMTP_PASS="$(read_env_val "$PANEL_ENV" SMTP_PASS)"
    [ -z "$SMTP_FROM" ] && SMTP_FROM="$(read_env_val "$PANEL_ENV" SMTP_FROM)"
    [ -z "$STRIPE_KEY" ] && STRIPE_KEY="$(read_env_val "$PANEL_ENV" STRIPE_SECRET_KEY)"
  else
    echo "WARNING: panel .env not found"
  fi
fi

# Interactive prompts for anything still missing
prompt_if_empty() {
  local var_name="$1" prompt="$2" secret="${3:-0}"
  local current="${!var_name:-}"
  [ -n "$current" ] && return 0
  if [ "$secret" = "1" ]; then
    read -rsp "$prompt: " current
    echo ""
  else
    read -rp "$prompt: " current
  fi
  printf -v "$var_name" '%s' "$current"
}

echo "--- SMTP (activation codes, password reset) ---"
echo "Required: SMTP_HOST, SMTP_USER, SMTP_PASS"
echo "Common Gmail: host=smtp.gmail.com port=587 + App Password (not your normal password)"
echo ""

prompt_if_empty SMTP_HOST "SMTP_HOST (e.g. smtp.gmail.com)"
prompt_if_empty SMTP_PORT "SMTP_PORT [587]"
SMTP_PORT="${SMTP_PORT:-587}"
prompt_if_empty SMTP_USER "SMTP_USER (login email)"
prompt_if_empty SMTP_PASS "SMTP_PASS" 1
prompt_if_empty SMTP_FROM "SMTP_FROM [Nexlify <noreply@nexlify.live>]"
SMTP_FROM="${SMTP_FROM:-Nexlify <noreply@nexlify.live>}"

echo ""
echo "--- Stripe (paid checkout after Sep 1, 2026 promo) ---"
echo "Get keys: https://dashboard.stripe.com/apikeys (use Live mode for production)"
echo "Only STRIPE_SECRET_KEY is required — checkout completes on success redirect (no webhook)."
echo ""

prompt_if_empty STRIPE_KEY "STRIPE_SECRET_KEY (sk_live_... or sk_test_... for testing)"

if [ -z "$SMTP_HOST" ] || [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASS" ]; then
  echo "ERROR: SMTP_HOST, SMTP_USER, and SMTP_PASS are required" >&2
  exit 1
fi

chmod 600 "$ENV_FILE" 2>/dev/null || true
set_env_val SMTP_HOST "$SMTP_HOST"
set_env_val SMTP_PORT "$SMTP_PORT"
set_env_val SMTP_USER "$SMTP_USER"
set_env_val SMTP_PASS "$SMTP_PASS"
set_env_val SMTP_FROM "$SMTP_FROM"

if [ -n "$STRIPE_KEY" ]; then
  set_env_val STRIPE_SECRET_KEY "$STRIPE_KEY"
fi

echo ""
echo "Wrote SMTP + Stripe to $ENV_FILE"

# Test SMTP
echo ""
echo "-> Testing SMTP..."
cd "$MARKETING"
if npx tsx scripts/test-marketing-smtp.ts "$SMTP_USER" 2>&1; then
  echo "SMTP test: OK (check inbox for $SMTP_USER)"
else
  echo "SMTP test: FAILED — check host/port/password (Gmail needs App Password + 2FA)"
  exit 1
fi

# Restart marketing app to pick up new env
if command -v pm2 >/dev/null 2>&1; then
  echo ""
  echo "-> Restarting nexlify-web..."
  pm2 restart nexlify-web --update-env 2>&1 | tail -2
fi

echo ""
echo "=== Status ==="
grep -q '^SMTP_HOST=' "$ENV_FILE" && echo "SMTP: configured ($SMTP_HOST:$SMTP_PORT)"
grep -q '^STRIPE_SECRET_KEY=sk_' "$ENV_FILE" && echo "Stripe: configured" || echo "Stripe: not set"
echo "Done."
