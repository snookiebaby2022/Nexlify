#!/usr/bin/env bash
# Nexlify full platform audit — marketing site + IPTV panel + nginx + installer.
# Run on vendor VPS as root:
#   bash /root/nexlify-full-platform-audit.sh
# Or from repo:
#   bash scripts/nexlify-full-platform-audit.sh

set -uo pipefail

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
PANEL=""
for d in /home/nexlify-panel /opt/nexlify-panel; do
  [ -f "$d/package.json" ] && [ -f "$d/.env" ] && PANEL="$d" && break
done

PASS=0
WARN=0
FAIL=0

ok()   { echo "  ✓ $*"; PASS=$((PASS + 1)); }
warn() { echo "  ! $*"; WARN=$((WARN + 1)); }
fail() { echo "  ✗ $*"; FAIL=$((FAIL + 1)); }

section() { echo ""; echo "=== $* ==="; }

http_code() {
  curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "$1" 2>/dev/null || echo "000"
}

section "Environment paths"
echo "Marketing: $MARKETING"
echo "Panel:     ${PANEL:-NOT FOUND}"
[ -d "$MARKETING" ] && ok "Marketing directory exists" || fail "Marketing directory missing ($MARKETING)"
[ -n "$PANEL" ] && ok "Panel directory exists" || warn "Panel directory not found (vendor-only marketing VPS?)"

section "System services"
for svc in postgresql nginx redis-server; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    ok "$svc active"
  else
    if [ "$svc" = "redis-server" ] && [ -z "$PANEL" ]; then
      warn "$svc not active (optional if no panel on this host)"
    else
      fail "$svc not active — run: systemctl start $svc"
    fi
  fi
done

section "PM2 processes"
if command -v pm2 >/dev/null 2>&1; then
  pm2 jlist 2>/dev/null | node -e "
    const l=JSON.parse(require('fs').readFileSync(0,'utf8')||'[]');
    for (const n of ['nexlify-web','nexlify','nexlify-cron','nexlify-license']) {
      const p=l.find(x=>x.name===n);
      if (!p) continue;
      const s=p.pm2_env?.status||'?';
      console.log(n+':'+s);
    }
  " 2>/dev/null | while IFS=: read -r name status; do
    [ "$status" = "online" ] && ok "PM2 $name online" || fail "PM2 $name status=$status"
  done
  pm2 describe nexlify-web >/dev/null 2>&1 || warn "PM2 nexlify-web not registered"
  pm2 describe nexlify >/dev/null 2>&1 || warn "PM2 nexlify (panel) not registered"
else
  fail "pm2 not installed"
fi

section "Marketing site ($MARKETING)"
if [ -d "$MARKETING" ]; then
  MPORT="${MARKETING_PORT:-13001}"
  MBASE="http://127.0.0.1:${MPORT}"

  [ -f "$MARKETING/.next/BUILD_ID" ] && ok "Marketing build present" || fail "Marketing .next/BUILD_ID missing — run npm run build"
  [ -f "$MARKETING/.env" ] && ok "Marketing .env exists" || fail "Marketing .env missing"

  if [ -f "$MARKETING/.env" ]; then
    grep -q 'nexlify_marketing' "$MARKETING/.env" && ok "DATABASE_URL → nexlify_marketing" || fail "DATABASE_URL wrong DB (must be nexlify_marketing)"
    grep -q '^JWT_SECRET=' "$MARKETING/.env" && ok "JWT_SECRET set" || fail "JWT_SECRET missing"
    grep -q '^ADMIN_EMAIL=' "$MARKETING/.env" && ok "ADMIN_EMAIL set" || warn "ADMIN_EMAIL missing"
    grep -q '^SMTP_HOST=' "$MARKETING/.env" && grep -q '^SMTP_PASS=' "$MARKETING/.env" \
      && ok "SMTP configured" || warn "SMTP not configured (activation emails + password reset)"
    grep -q '^STRIPE_SECRET_KEY=sk_' "$MARKETING/.env" && ok "Stripe key set" || warn "STRIPE_SECRET_KEY missing (needed after Sep 1, 2026)"
  fi

  [ -f "$MARKETING/.license-keys/private.pem" ] && ok "License signing key present" \
    || fail "License key missing — bash scripts/setup-marketing-license-key.sh"

  [ -f "$MARKETING/deploy/nginx-security-headers.conf" ] && ok "nginx-security-headers.conf present" \
    || fail "Missing deploy/nginx-security-headers.conf (nginx fails on reboot)"

  for script in configure-marketing-smtp-stripe.sh test-marketing-smtp.ts marketing-health-check.sh; do
    [ -f "$MARKETING/scripts/$script" ] && ok "scripts/$script present" || warn "scripts/$script missing (run vps-full-update.sh)"
  done

  code=$(http_code "$MBASE/api/health")
  [ "$code" = "200" ] && ok "Marketing /api/health → $code" || fail "Marketing /api/health → $code"

  for path in / /pricing "/register?trial=1" /login /admin; do
    code=$(http_code "$MBASE$path")
    case "$path" in
      /admin) [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ] && ok "$path → $code" || fail "$path → $code" ;;
      *) [ "$code" = "200" ] && ok "$path → $code" || fail "$path → $code" ;;
    esac
  done

  curl -sf "$MBASE/pricing" 2>/dev/null | grep -q 'September 1, 2026' \
    && ok "Pricing shows Sep 1, 2026 promo" || warn "Pricing promo date missing"
  curl -sf "$MBASE/pricing" 2>/dev/null | grep -q 'Nexlify License' \
    && ok "Single plan (Nexlify License) on pricing" || warn "Nexlify License plan not on pricing page"

  if [ -f "$MARKETING/scripts/marketing-health-check.sh" ]; then
    echo ""
    echo "--- marketing-health-check.sh ---"
    bash "$MARKETING/scripts/marketing-health-check.sh" 2>&1 | tail -20
  fi
fi

section "Marketing HTTPS (nginx → :13001)"
code=$(http_code "https://127.0.0.1/" -H "Host: nexlify.live" -k 2>/dev/null || http_code "https://nexlify.live/")
[ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ] \
  && ok "nexlify.live HTTPS → $code" || fail "nexlify.live HTTPS → $code (nginx down?)"

if nginx -t >/dev/null 2>&1; then ok "nginx config valid"; else fail "nginx -t failed"; fi

section "Panel installer assets"
for url in \
  "https://nexlify.live/install/panel.sh" \
  "https://nexlify.live/downloads/nexlify-panel.tar.gz"; do
  code=$(http_code "$url")
  [ "$code" = "200" ] && ok "$url → $code" || fail "$url → $code"
done

section "IPTV panel ($PANEL)"
if [ -n "$PANEL" ]; then
  cd "$PANEL"
  PPORT=$(grep '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || echo 13000)
  PPORT=${PPORT:-13000}
  PBASE="http://127.0.0.1:${PPORT}"

  [ -f .next/BUILD_ID ] && ok "Panel build present" || fail "Panel .next/BUILD_ID missing"
  [ -f .env ] && ok "Panel .env exists" || fail "Panel .env missing"

  grep -q '^DATABASE_URL=' .env && ok "Panel DATABASE_URL set" || fail "Panel DATABASE_URL missing"
  grep -qE '^NEXLIFY_LICENSE|^PANEL_INTERNAL|^NEXLIFY_PANEL_API' .env \
    && ok "Panel license sync env present" || warn "Panel license sync secrets missing"

  redis-cli ping >/dev/null 2>&1 && ok "Redis ping" || fail "Redis not responding"

  for path in /api/health /login; do
    code=$(http_code "$PBASE$path")
    [ "$code" = "200" ] || [ "$code" = "307" ] && ok "Panel $path → $code" || fail "Panel $path → $code"
  done

  code=$(http_code "$PBASE/player_api.php?username=__audit__&password=__audit__")
  [ "$code" = "400" ] || [ "$code" = "401" ] && ok "Xtream player_api.php → $code" || warn "player_api.php → $code"

  if [ -x scripts/full-audit-smoke.sh ]; then
    echo ""
    echo "--- panel full-audit-smoke.sh ---"
    bash scripts/full-audit-smoke.sh 2>&1 | tail -25
  fi

  code=$(http_code "https://panel.nexlify.live/api/health" 2>/dev/null || echo "000")
  [ "$code" = "200" ] && ok "panel.nexlify.live HTTPS health → $code" || warn "panel.nexlify.live → $code"

  code=$(http_code "https://panel.demo.nexlify.live/" 2>/dev/null || echo "000")
  [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ] || [ "$code" = "307" ] \
    && ok "panel.demo.nexlify.live → $code" || warn "panel.demo.nexlify.live → $code"
fi

section "License server (optional vendor)"
code=$(http_code "http://127.0.0.1:8787/" 2>/dev/null)
if [ "$code" = "000" ]; then
  warn "License server :8787 not responding (optional if using local NXLF1 signing)"
else
  ok "License server :8787 → $code"
fi

section "PostgreSQL databases"
if command -v psql >/dev/null 2>&1; then
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='nexlify_marketing'" 2>/dev/null | grep -q 1 \
    && ok "DB nexlify_marketing exists" || fail "DB nexlify_marketing missing"
  if [ -n "$PANEL" ]; then
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='nexlify'" 2>/dev/null | grep -q 1 \
      && ok "DB nexlify (panel) exists" || fail "DB nexlify missing"
  fi
else
  warn "psql not available"
fi

section "Summary"
echo ""
echo "Passed: $PASS"
echo "Warnings: $WARN"
echo "Failed: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "AUDIT FAILED — fix ✗ items above before go-live."
  exit 1
fi

if [ "$WARN" -gt 0 ]; then
  echo "AUDIT PASSED WITH WARNINGS — optional items (!) should be configured."
  exit 0
fi

echo "AUDIT PASSED — all critical checks OK."
exit 0
