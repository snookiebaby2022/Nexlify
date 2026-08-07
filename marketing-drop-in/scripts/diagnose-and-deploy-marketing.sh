#!/usr/bin/env bash
# Find where nexlify.live is actually served from, then deploy marketing updates.
# Run on the VPS: bash diagnose-and-deploy-marketing.sh
set -euo pipefail

echo "=== Nexlify marketing deploy diagnostic ==="
echo ""

# --- 1) Find panel repo ---
PANEL=""
for d in /home/nexlify-panel /opt/nexlify-panel; do
  if [ -d "$d/.git" ]; then
    PANEL="$d"
    break
  fi
done
if [ -z "$PANEL" ]; then
  echo "ERROR: No panel git repo at /home/nexlify-panel or /opt/nexlify-panel"
  exit 1
fi
echo "Panel repo: $PANEL"

# --- 2) Find what PM2 is actually running ---
echo ""
echo "=== PM2 nexlify-web ==="
pm2 describe nexlify-web 2>/dev/null | grep -E 'exec cwd|script path|status|restarts' || echo "(nexlify-web not found in PM2)"

PM2_CWD="$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
try:
  apps=json.load(sys.stdin)
except: sys.exit(0)
for a in apps:
  if a.get('name') in ('nexlify-web','nexlify-website'):
    print(a.get('pm2_env',{}).get('pm_cwd',''))
    break
" 2>/dev/null || true)"

echo "PM2 working directory: ${PM2_CWD:-unknown}"

# --- 3) Check candidate marketing roots ---
echo ""
echo "=== Marketing source copies (August vs September promo text) ==="
for d in /var/www/nexlify "$PANEL/marketing-drop-in" /home/nexlify; do
  [ -f "$d/package.json" ] || continue
  aug="$(grep -r 'August 1, 2026' "$d/src" 2>/dev/null | wc -l | tr -d ' ')"
  sep="$(grep -r 'September 1, 2026' "$d/src" 2>/dev/null | wc -l | tr -d ' ')"
  pris="$(test -f "$d/prisma.config.ts" && echo yes || echo no)"
  build="$(test -f "$d/.next/BUILD_ID" && cat "$d/.next/BUILD_ID" || echo none)"
  echo "  $d"
  echo "    August mentions: $aug | September mentions: $sep | prisma.config.ts: $pris | BUILD_ID: $build"
done

# --- 4) What nginx serves ---
echo ""
echo "=== Nginx upstream for nexlify.live ==="
grep -r "13001\|3001\|nexlify" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -10 || true

echo ""
echo "=== Local HTTP check (what PM2 serves) ==="
for port in 13001 3001; do
  if curl -sf "http://127.0.0.1:${port}/pricing" >/tmp/nx-pricing.html 2>/dev/null; then
    if grep -q 'September 1, 2026' /tmp/nx-pricing.html; then
      echo "  Port $port → NEW code (September 1)"
    elif grep -q 'August 1, 2026' /tmp/nx-pricing.html; then
      echo "  Port $port → OLD code (August 1) ← this is what users see if nginx points here"
    else
      echo "  Port $port → unknown promo text"
    fi
  fi
done

# --- 5) Deploy ---
MARKETING="${PM2_CWD:-/var/www/nexlify}"
if [ ! -f "$MARKETING/package.json" ]; then
  MARKETING="/var/www/nexlify"
fi

echo ""
echo "=== Deploying to: $MARKETING ==="
read -r -p "Continue deploy? [y/N] " ans
if [ "${ans:-n}" != "y" ] && [ "${ans:-n}" != "Y" ]; then
  echo "Aborted. Fix MARKETING path manually if the directory above is wrong."
  exit 0
fi

cd "$PANEL"
echo "-> git pull"
git pull origin main

echo "-> rsync marketing-drop-in -> $MARKETING"
rsync -a --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .env \
  --exclude src/generated \
  "$PANEL/marketing-drop-in/" "$MARKETING/"

cd "$MARKETING"
echo "-> npm install"
npm install --include=dev --no-audit --no-fund

echo "-> prisma generate + build"
rm -f prisma.config.ts
rm -rf .next src/generated/prisma
npx prisma generate
npm run build

echo "-> pm2 restart"
pm2 restart nexlify-web --update-env || pm2 start npm --name nexlify-web -- start -- -H 127.0.0.1 -p 13001
pm2 save

sleep 3
echo ""
echo "=== Verify ==="
curl -sf "http://127.0.0.1:13001/pricing" | grep -o 'Free until [^<]*' | head -1 || true
curl -sf "http://127.0.0.1:3001/pricing" 2>/dev/null | grep -o 'Free until [^<]*' | head -1 || true
echo ""
echo "If still August 1 above, PM2 cwd differs — run: pm2 describe nexlify-web"
echo "Then purge Cloudflare cache for nexlify.live if using Cloudflare."
