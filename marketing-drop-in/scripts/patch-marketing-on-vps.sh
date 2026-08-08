#!/usr/bin/env bash
# Patch nexlify.live marketing site WITHOUT git/GitHub.
# Run on VPS: bash patch-marketing-on-vps.sh
# Safe: never calls 'exit' — won't disconnect PuTTY.

set -u
ROOT="${1:-/var/www/nexlify}"

echo "=== Patching marketing site at $ROOT ==="

if [ ! -d "$ROOT/src" ]; then
  echo "ERROR: $ROOT/src not found — wrong path?"
else

cd "$ROOT"

echo "-> Fix install URL query string (?v= not ?v)"
PI="src/lib/panel-install.ts"
if [ -f "$PI" ]; then
  if ! grep -q 'INSTALLER_CACHE_QUERY' "$PI" 2>/dev/null; then
    sed -i \
      -e 's|panel.sh?${INSTALLER_VERSION}|panel.sh?${INSTALLER_CACHE_QUERY}|g' \
      -e 's|panel.sh?v1.9.7|panel.sh?v=1.9.7|g' \
      "$PI"
    grep -q 'INSTALLER_CACHE_QUERY' "$PI" || \
      sed -i '/export const INSTALLER_VERSION/a export const INSTALLER_CACHE_QUERY = `v=${PANEL_VERSION}`;' "$PI"
  fi
fi
if [ -d .next ]; then
  find .next -type f -name '*.js' 2>/dev/null | while read -r f; do
    grep -qE 'panel\.sh\?v1\.9\.7|panel\.sh\?v[0-9]+\.[0-9]+\.[0-9]+' "$f" 2>/dev/null && \
      sed -i 's|panel.sh?v1.9.7|panel.sh?v=1.9.7|g' "$f"
  done
fi

echo "-> Replace August 1 promo with September 1"
find src -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | while IFS= read -r -d '' f; do
  sed -i \
    -e 's/August 1, 2026/September 1, 2026/g' \
    -e 's/2026-08-01T00:00:00Z/2026-09-01T00:00:00Z/g' \
    -e 's/"2026-08-01"/"2026-09-01"/g' \
    -e 's/until Aug 1, 2026/until Sep 1, 2026/g' \
    "$f" 2>/dev/null || true
done

echo "-> Remove prisma.config.ts (breaks build without dotenv)"
rm -f prisma.config.ts

echo "-> Ensure prisma + dotenv installed for build"
npm install prisma@6.9.0 dotenv@16.5.0 --save --no-audit --no-fund 2>&1 | tail -3

echo "-> Patch checkout free-period (if missing)"
CHECKOUT="src/app/api/checkout/route.ts"
if [ -f "$CHECKOUT" ] && ! grep -q 'isFreePeriod()' "$CHECKOUT"; then
  if ! grep -q 'isFreePeriod' "$CHECKOUT"; then
    sed -i 's/from "@\/lib\/marketing-coupon";/from "@\/lib\/marketing-coupon";\nimport { isFreePeriod } from "@\/lib\/marketing-coupon";/' "$CHECKOUT" 2>/dev/null || true
    # simpler: add isFreePeriod to existing import
    sed -i 's/couponCheckoutTotals,/couponCheckoutTotals,\n  isFreePeriod,/' "$CHECKOUT" 2>/dev/null || true
  fi
  python3 << 'PY'
from pathlib import Path
p = Path("src/app/api/checkout/route.ts")
text = p.read_text()
needle = "    let appliedCoupon: string | null = null;\n"
block = needle + """
    if (isFreePeriod() && plan.slug !== TRIAL_PLAN_SLUG) {
      amountCents = 0;
      licenseDurationDays = plan.durationDays;
    }

"""
if "isFreePeriod() && plan.slug" not in text and needle in text:
    text = text.replace(needle, block, 1)
    p.write_text(text)
    print("  Added isFreePeriod checkout block")
else:
    print("  Checkout already patched or structure differs")
PY
fi

echo "-> Patch PricingSection stripe bypass during free period"
PRICING="src/components/PricingSection.tsx"
if [ -f "$PRICING" ] && grep -q '!stripeEnabled)' "$PRICING" && ! grep -q 'isFreePeriod()' "$PRICING"; then
  sed -i 's/!stripeEnabled)/!stripeEnabled \&\& !isFreePeriod())/' "$PRICING" 2>/dev/null || true
  sed -i 's/readPendingCouponCode } from "@\/lib\/marketing-coupon"/FREE_PERIOD_END_LABEL, isFreePeriod, readPendingCouponCode } from "@\/lib\/marketing-coupon"/' "$PRICING" 2>/dev/null || true
fi

echo "-> Count September mentions (should be > 0)"
grep -r "September 1, 2026" src 2>/dev/null | wc -l

echo "-> Rebuild"
rm -rf .next src/generated/prisma
npx prisma generate 2>&1 | tail -2
npm run build 2>&1 | tail -8

echo "-> Restart PM2"
pm2 restart nexlify-web --update-env 2>&1 | tail -3

sleep 2
echo "-> Verify"
curl -s http://127.0.0.1:13001/pricing 2>/dev/null | grep -o 'Free until [^<]*' | head -1 || echo "(curl failed)"
curl -s http://127.0.0.1:13001/install 2>/dev/null | grep -oE 'panel\.sh[^"'\''<> ]*' | head -3 || echo "(install curl failed)"

echo "=== Done ==="
fi
