#!/usr/bin/env bash
# Full marketing site health check on VPS (no GitHub required).
# Run: bash scripts/marketing-health-check.sh

set -u
ROOT="${1:-/var/www/nexlify}"
PORT="${2:-13001}"

echo "=== Nexlify marketing health check ==="
echo "Root: $ROOT"
echo ""

score_ok=0
score_fail=0

check() {
  local label="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  ✓ $label"
    score_ok=$((score_ok + 1))
  else
    echo "  ✗ $label — $result"
    score_fail=$((score_fail + 1))
  fi
}

# 1) License signing key
if [ -f "$ROOT/.license-keys/private.pem" ] || grep -q '^LICENSE_SERVER_PRIVATE_PEM=' "$ROOT/.env" 2>/dev/null; then
  check "License signing key configured" ok
else
  check "License signing key configured" "MISSING — trials and paid licenses will fail"
fi

# 2) Promo date in source
sep=$(grep -r "September 1, 2026" "$ROOT/src" 2>/dev/null | wc -l | tr -d ' ')
if [ "${sep:-0}" -gt 0 ]; then
  check "September 1 promo in source ($sep refs)" ok
else
  check "September 1 promo in source" "not found — run sed patch or deploy new src"
fi

# 3) Single plan in source
if grep -rq 'slug: "nexlify"' "$ROOT/src/lib/plans.ts" 2>/dev/null || grep -rq 'PAID_PLAN_SLUG' "$ROOT/src/lib/plans.ts" 2>/dev/null; then
  check "Single £50 plan code present" ok
else
  check "Single £50 plan code present" "old multi-tier source still deployed"
fi

# 4) Checkout free period
if grep -q 'isFreePeriod()' "$ROOT/src/app/api/checkout/route.ts" 2>/dev/null; then
  check "Free-period checkout logic" ok
else
  check "Free-period checkout logic" "missing — paid checkout may charge during promo"
fi

# 5) Stripe for post-promo
if grep -q '^STRIPE_SECRET_KEY=sk_' "$ROOT/.env" 2>/dev/null; then
  check "Stripe configured (post-promo payments)" ok
else
  check "Stripe configured (post-promo payments)" "STRIPE_SECRET_KEY not set — paid checkout after Sep 1 will fail"
fi

# 6) Build exists
if [ -f "$ROOT/.next/BUILD_ID" ]; then
  check "Production build (.next/BUILD_ID)" ok
else
  check "Production build" "missing — run npm run build"
fi

# 7) PM2
if pm2 describe nexlify-web >/dev/null 2>&1; then
  check "PM2 nexlify-web running" ok
else
  check "PM2 nexlify-web running" "not found"
fi

# 8) Live HTTP checks
if curl -sf "http://127.0.0.1:${PORT}/register?trial=1" >/tmp/nx-reg.html 2>/dev/null; then
  if grep -q 'trial license' /tmp/nx-reg.html; then
    check "Trial register page (/register?trial=1)" ok
  else
    check "Trial register page" "loads but trial copy missing"
  fi
else
  check "Trial register page" "HTTP failed on port $PORT"
fi

if curl -sf "http://127.0.0.1:${PORT}/pricing" >/tmp/nx-price.html 2>/dev/null; then
  if grep -q 'September 1, 2026' /tmp/nx-price.html; then
    check "Pricing shows September 1 promo" ok
  else
    check "Pricing shows September 1 promo" "still shows old date"
  fi
  if grep -q 'Nexlify License' /tmp/nx-price.html && grep -q '7-Day Trial' /tmp/nx-price.html; then
    if grep -q 'Top Tier\|Starter Plan\|Main Plan' /tmp/nx-price.html; then
      check "Single plan pricing UI" "shows Nexlify License but old tier names still in page HTML (SEO/schema — redeploy latest src)"
    else
      check "Single plan pricing UI" ok
    fi
  elif grep -q 'Top Tier\|Starter' /tmp/nx-price.html; then
    check "Single plan pricing UI" "still shows old Starter/Main/Top Tier — run sync-plans-vps.ts and deploy new src"
  else
    check "Single plan pricing UI" "Nexlify License card not found"
  fi
else
  check "Pricing page HTTP" "failed"
fi

echo ""
echo "=== Summary: $score_ok passed, $score_fail failed ==="
echo ""
echo "Fix order:"
echo "  1. bash scripts/setup-marketing-license-key.sh     # trials + licenses"
echo "  2. bash scripts/setup-marketing-env.sh             # .env from panel secrets"
echo "  3. npx tsx scripts/sync-plans-vps.ts               # single £50 plan in DB"
echo "  4. npm run build && pm2 restart nexlify-web        # after uploading new src"
echo ""
