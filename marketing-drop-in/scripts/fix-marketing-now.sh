#!/usr/bin/env bash
# Fix nexlify.live marketing site — server-side exception / HTTP 500.
# Run on vendor VPS as root:
#   curl -fsSL 'https://nexlify.live/install/fix-marketing-now.sh' | sudo bash
# Or:
#   bash /var/www/nexlify/scripts/fix-marketing-now.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
PORT="${MARKETING_PORT:-13001}"

echo "=========================================="
echo " Nexlify marketing site repair"
echo " Dir: $MARKETING"
echo "=========================================="

if [ ! -f "$MARKETING/package.json" ]; then
  echo "ERROR: marketing site not found at $MARKETING" >&2
  exit 1
fi
cd "$MARKETING"

echo "==> 1) Ensure marketing DATABASE_URL (nexlify_marketing) ..."
if [ -x "$MARKETING/scripts/ensure-marketing-database-url.sh" ]; then
  bash "$MARKETING/scripts/ensure-marketing-database-url.sh" "$MARKETING"
elif [ -x "$PANEL/marketing-drop-in/scripts/ensure-marketing-database-url.sh" ]; then
  bash "$PANEL/marketing-drop-in/scripts/ensure-marketing-database-url.sh" "$MARKETING"
else
  echo "WARN: ensure-marketing-database-url.sh not found — check DATABASE_URL in .env"
fi

if [ -x "$MARKETING/scripts/load-marketing-env.sh" ]; then
  # shellcheck disable=SC1091
  source "$MARKETING/scripts/load-marketing-env.sh"
fi

if ! grep -q '^JWT_SECRET=' .env 2>/dev/null || [ "$(grep '^JWT_SECRET=' .env | cut -d= -f2- | tr -d ' \"'"'"'' | wc -c)" -lt 32 ]; then
  JWT="$(openssl rand -base64 48 2>/dev/null | tr -d '\n' | head -c 48 || head -c 48 /dev/urandom | base64 | tr -d '\n')"
  grep -v '^JWT_SECRET=' .env > .env.tmp 2>/dev/null || true
  mv .env.tmp .env
  echo "JWT_SECRET=${JWT}" >> .env
  echo "   Set JWT_SECRET in .env"
fi

echo "==> 2) Sync panel-releases + install scripts ..."
# Always pull the latest panel-releases.json from GitHub (public repo, no auth needed).
# This ensures the build always has the current latestVersion even if local source is stale.
GITHUB_RAW="https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main"
_releases_url="$GITHUB_RAW/marketing-drop-in/src/lib/panel-releases.json"
_install_cmd_url="$GITHUB_RAW/marketing-drop-in/public/install-command.json"
_whats_new_url="$GITHUB_RAW/marketing-drop-in/src/components/WhatsNewSection.tsx"

if curl -fsSL --max-time 15 "$_releases_url" -o /tmp/panel-releases-latest.json 2>/dev/null; then
  cp -f /tmp/panel-releases-latest.json "$MARKETING/src/lib/panel-releases.json"
  cp -f /tmp/panel-releases-latest.json "$MARKETING/public/panel-releases.json"
  echo "   Updated panel-releases.json from GitHub (latestVersion: $(node -p "require('/tmp/panel-releases-latest.json').latestVersion" 2>/dev/null || echo '?'))"
elif [ -f "$PANEL/src/lib/panel-releases.json" ]; then
  cp -f "$PANEL/src/lib/panel-releases.json" "$MARKETING/src/lib/panel-releases.json"
  cp -f "$PANEL/src/lib/panel-releases.json" "$MARKETING/public/panel-releases.json"
  echo "   Copied panel-releases.json from panel source (GitHub unavailable)"
fi

if curl -fsSL --max-time 15 "$_install_cmd_url" -o /tmp/install-command-latest.json 2>/dev/null; then
  cp -f /tmp/install-command-latest.json "$MARKETING/public/install-command.json"
  echo "   Updated install-command.json from GitHub"
fi

if curl -fsSL --max-time 15 "$_whats_new_url" -o /tmp/WhatsNewSection-latest.tsx 2>/dev/null; then
  cp -f /tmp/WhatsNewSection-latest.tsx "$MARKETING/src/components/WhatsNewSection.tsx"
  echo "   Updated WhatsNewSection.tsx from GitHub"
fi

if [ -d "$PANEL/marketing-drop-in/public/install" ]; then
  rsync -a "$PANEL/marketing-drop-in/public/install/" "$MARKETING/public/install/" 2>/dev/null || \
    cp -a "$PANEL/marketing-drop-in/public/install/." "$MARKETING/public/install/"
fi

echo "==> 3) Prisma generate + db push ..."
npx prisma generate
npx prisma db push --accept-data-loss --skip-generate 2>/dev/null || npx prisma db push --accept-data-loss

echo "==> 4) Rebuild marketing site (2-5 min) ..."
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
npm run build

if [ ! -f .next/BUILD_ID ]; then
  echo "ERROR: marketing build failed — check output above" >&2
  exit 1
fi

echo "==> 5) Restart PM2 nexlify-web ..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
pm2 restart nexlify-web --update-env 2>/dev/null || \
  pm2 start npm --name nexlify-web --cwd "$MARKETING" -- start -- -H 127.0.0.1 -p "$PORT"
pm2 save 2>/dev/null || true
sleep 4

echo "==> 6) Verify ..."
fail=0
for path in / /install /pricing /api/health; do
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}${path}" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then
    echo "   OK  ${path} HTTP 200"
  else
    echo "   FAIL ${path} HTTP ${code}"
    fail=1
  fi
done

echo ""
if [ "$fail" = "0" ]; then
  echo "=========================================="
  echo " MARKETING SITE OK — https://nexlify.live"
  echo " Hard-refresh browser (Ctrl+Shift+R)"
  echo "=========================================="
else
  echo "=========================================="
  echo " Some checks failed — run: pm2 logs nexlify-web --lines 50"
  echo "=========================================="
  exit 1
fi
