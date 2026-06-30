#!/bin/bash
# Deploy marketing-growth-toolkit into /var/www/nexlify (nexlify-web).
set -euo pipefail

PANEL="${1:-/home/nexlify-panel}"
MARKETING="${NEXLIFY_MARKETING_PATH:-/var/www/nexlify}"
TOOLKIT="$PANEL/marketing-growth-toolkit"

if [ ! -d "$TOOLKIT/src" ]; then
  echo "Missing $TOOLKIT — sync nexlify-panel first"
  exit 1
fi

echo "=== Copy growth toolkit → $MARKETING ==="
mkdir -p "$MARKETING/src/lib" "$MARKETING/src/components/growth" "$MARKETING/src/app/grow/links" "$MARKETING/src/app/go/license" "$MARKETING/src/app/go/demo"

cp "$TOOLKIT/src/lib/growth-urls.ts" "$MARKETING/src/lib/growth-urls.ts"
cp "$TOOLKIT/src/components/growth/"*.tsx "$MARKETING/src/components/growth/"
cp "$TOOLKIT/src/app/grow/page.tsx" "$MARKETING/src/app/grow/page.tsx"
cp "$TOOLKIT/src/app/grow/links/page.tsx" "$MARKETING/src/app/grow/links/page.tsx"
cp "$TOOLKIT/src/app/grow/layout.tsx" "$MARKETING/src/app/grow/layout.tsx"
cp "$TOOLKIT/src/app/go/license/route.ts" "$MARKETING/src/app/go/license/route.ts"
cp "$TOOLKIT/src/app/go/demo/route.ts" "$MARKETING/src/app/go/demo/route.ts"

# Promo landing (if not already on marketing site)
mkdir -p "$MARKETING/src/app/promo"
if [ ! -f "$MARKETING/src/app/promo/page.tsx" ] && [ -f "$PANEL/promo-for-nexlify-web/app/promo/page.tsx" ]; then
  cp "$PANEL/promo-for-nexlify-web/app/promo/page.tsx" "$MARKETING/src/app/promo/page.tsx"
  cp "$PANEL/promo-for-nexlify-web/components/promo-landing.tsx" "$MARKETING/src/components/promo-landing.tsx"
  echo "Installed /promo landing from promo-for-nexlify-web"
fi

python3 "$TOOLKIT/scripts/patch-marketing-growth-css.py"

echo ""
echo "=== Growth toolkit files synced (no rebuild — use deploy-marketing-full.ps1 to build) ==="
echo "  Toolkit (copy links):  https://nexlify.live/grow"
echo "  All campaign links:    https://nexlify.live/grow/links"
echo "  TikTok bio link:       https://nexlify.live/promo/tiktok?utm_source=tiktok&utm_medium=bio&utm_campaign=operators"
echo "  Text landing:          https://nexlify.live/promo?utm_source=tiktok&utm_medium=landing&utm_campaign=operators"
echo "  Short → pricing:       https://nexlify.live/go/license"
echo "  Short → demo:          https://nexlify.live/go/demo"

curl -sI --max-time 5 http://127.0.0.1:3001/grow 2>/dev/null | head -1 || \
curl -sI --max-time 5 http://127.0.0.1:3001/grow 2>/dev/null | head -1 || true
