#!/usr/bin/env bash
# Post-audit env hygiene: panel CRON_SECRET dedupe, marketing DEMO_* server-only vars
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"

echo "=== ensure-security-env ==="

set_kv() {
  local file="$1" key="$2" val="$3"
  touch "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

ensure_secret_key() {
  local file="$1" key="$2" min_len="${3:-32}"
  local val weak
  val="$(grep "^${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
  weak=0
  case "$val" in
    ""|change-me*|dev-secret*|your-*|*change-this*) weak=1 ;;
  esac
  if [ "$weak" = 1 ] || [ "${#val}" -lt "$min_len" ]; then
    val="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    set_kv "$file" "$key" "$val"
    echo "  generated ${key} in $file"
  fi
}

rand_hex() {
  openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

# --- Panel: never global license skip; dedupe CRON_SECRET ---
if [ -f "$PANEL_DIR/.env" ]; then
  sed -i '/^PANEL_DEMO_NO_LICENSE=/d;/^NEXLIFY_LICENSE_SKIP=/d' "$PANEL_DIR/.env"
  CRON_VAL="$(grep '^CRON_SECRET=' "$PANEL_DIR/.env" | grep -v '^CRON_SECRET=$' | tail -1 | cut -d= -f2- | tr -d '\r')"
  if [ -z "$CRON_VAL" ]; then
    CRON_VAL="$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  grep -v '^CRON_SECRET=' "$PANEL_DIR/.env" > "$PANEL_DIR/.env.tmp" || true
  echo "CRON_SECRET=${CRON_VAL}" >> "$PANEL_DIR/.env.tmp"
  mv "$PANEL_DIR/.env.tmp" "$PANEL_DIR/.env"
  ensure_secret_key "$PANEL_DIR/.env" "JWT_SECRET" 32
  ensure_secret_key "$PANEL_DIR/.env" "ENCRYPTION_AT_REST_KEY" 32
  echo "Panel .env: license-skip removed, secrets verified"
fi

# --- Marketing: server-only demo credentials (not NEXT_PUBLIC_*) ---
if [ -f "$APP_DIR/.env" ]; then
  # Preserve last non-empty values before stripping client-exposed creds
  for pair in \
    "DEMO_ADMIN_USER:NEXT_PUBLIC_DEMO_ADMIN_USER:admin" \
    "DEMO_ADMIN_PASSWORD:NEXT_PUBLIC_DEMO_ADMIN_PASSWORD:admin123" \
    "DEMO_RESELLER_USER:NEXT_PUBLIC_DEMO_RESELLER_USER:reseller" \
    "DEMO_RESELLER_PASSWORD:NEXT_PUBLIC_DEMO_RESELLER_PASSWORD:reseller123" \
    "DEMO_LICENSE_KEY:NEXT_PUBLIC_DEMO_LICENSE_KEY:"; do
    IFS=: read -r dst src default <<< "$pair"
    val="$( (grep "^${src}=" "$APP_DIR/.env" 2>/dev/null || true) | tail -1 | cut -d= -f2- | tr -d '\r')"
    if [ -z "$val" ]; then
      val="$( (grep "^${dst}=" "$APP_DIR/.env" 2>/dev/null || true) | tail -1 | cut -d= -f2- | tr -d '\r')"
    fi
    if [ -z "$val" ] && [ -n "$default" ]; then val="$default"; fi
    if [ -n "$val" ]; then set_kv "$APP_DIR/.env" "$dst" "$val"; fi
  done

  sed -i \
    -e '/^NEXT_PUBLIC_DEMO_ADMIN_USER=/d' \
    -e '/^NEXT_PUBLIC_DEMO_ADMIN_PASSWORD=/d' \
    -e '/^NEXT_PUBLIC_DEMO_RESELLER_USER=/d' \
    -e '/^NEXT_PUBLIC_DEMO_RESELLER_PASSWORD=/d' \
    -e '/^NEXT_PUBLIC_DEMO_LICENSE_KEY=/d' \
    -e '/^NEXT_PUBLIC_TRIAL_PROMO_CODE=/d' \
    "$APP_DIR/.env"

  # Dedupe duplicate NEXT_PUBLIC_DEMO_PANEL_URL
  PANEL_URL="$( (grep '^NEXT_PUBLIC_DEMO_PANEL_URL=' "$APP_DIR/.env" 2>/dev/null || true) | tail -1 | cut -d= -f2- | tr -d '\r')"
  grep -v '^NEXT_PUBLIC_DEMO_PANEL_URL=' "$APP_DIR/.env" > "$APP_DIR/.env.tmp" || true
  echo "NEXT_PUBLIC_DEMO_PANEL_URL=${PANEL_URL:-https://panel.demo.nexlify.live/}" >> "$APP_DIR/.env.tmp"
  mv "$APP_DIR/.env.tmp" "$APP_DIR/.env"

  ensure_secret_key "$APP_DIR/.env" "JWT_SECRET" 32
  ensure_secret_key "$APP_DIR/.env" "ENCRYPTION_AT_REST_KEY" 32
  if ! grep -q '^PANEL_API_SECRET=' "$APP_DIR/.env" 2>/dev/null; then
    set_kv "$APP_DIR/.env" "PANEL_API_SECRET" "$(rand_hex)"
    echo "  generated PANEL_API_SECRET"
  fi
  echo "Marketing .env: DEMO_* server vars set, secrets verified"
fi

echo "ensure-security-env done."
