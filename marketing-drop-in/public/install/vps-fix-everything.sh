#!/usr/bin/env bash
# One-shot vendor VPS repair: panel rebuild, publish v1.9.11+ tarball, nginx, demo, verify.
#
# Run as root on vendor VPS (85.17.162.54):
#   export GITHUB_TOKEN=ghp_...   # PAT with repo read — revoke after use
#   curl -fsSL https://nexlify.live/install/vps-fix-everything.sh | bash
#
# Or without curl (private repo):
#   export GITHUB_TOKEN=ghp_...
#   git clone --depth 1 --branch main "https://${GITHUB_TOKEN}@github.com/snookiebaby2022/Nexlify.git" /tmp/nexlify-fix \
#     && bash /tmp/nexlify-fix/scripts/vps-fix-everything.sh
#
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
BRANCH="${NEXLIFY_GIT_BRANCH:-main}"
PANEL_PORT="${PANEL_PORT:-13000}"
MARKETING_PORT="${MARKETING_PORT:-13001}"

resolve_nexlify_git_url() {
  local token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  if [ -n "$token" ]; then
    echo "https://${token}@github.com/snookiebaby2022/Nexlify.git"
    return 0
  fi
  if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | grep -qi 'successfully authenticated'; then
    echo "git@github.com:snookiebaby2022/Nexlify.git"
    return 0
  fi
  echo "ERROR: Set GITHUB_TOKEN=ghp_... (repo read) or configure SSH deploy key" >&2
  exit 1
}

echo "=========================================="
echo " Nexlify VPS fix-everything"
echo " Panel: $PANEL  Marketing: $MARKETING"
echo "=========================================="

WORK=""
cleanup() {
  [ -n "$WORK" ] && rm -rf "$WORK"
}
trap cleanup EXIT

REPO_URL="$(resolve_nexlify_git_url)"
WORK="$(mktemp -d /tmp/nexlify-fix-everything.XXXXXX)"
echo "-> Cloning main from GitHub ..."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$WORK/nexlify" >/dev/null 2>&1
SRC="$WORK/nexlify"
VER="$(node -p "require('$SRC/package.json').version" 2>/dev/null || echo unknown)"
echo "   Source version: v$VER"

echo ""
echo "=== 1) Sync panel source -> $PANEL ==="
mkdir -p "$PANEL"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude='.env' --exclude='.env.*' \
    --exclude='data/' --exclude='node_modules/' \
    --exclude='.next/' --exclude='.next.backup/' --exclude='.next.staging/' \
    --exclude='.panel-update-cache.json' \
    --exclude='.update-progress.json' --exclude='.update-progress.pid' \
    --exclude='.update-worker-err.log' \
    "$SRC/" "$PANEL/"
else
  echo "WARN: rsync missing — using cp (slower)"
  find "$PANEL" -mindepth 1 -maxdepth 1 \
    ! -name '.env' ! -name 'data' ! -name 'node_modules' ! -name '.next' \
    -exec rm -rf {} + 2>/dev/null || true
  cp -a "$SRC/." "$PANEL/"
fi
sed -i 's/\r$//' "$PANEL"/scripts/*.sh 2>/dev/null || true
chmod +x "$PANEL"/scripts/*.sh 2>/dev/null || true
rm -f "$PANEL/.update-progress.json" "$PANEL/.update-progress.pid" "$PANEL/.update-worker-err.log"

echo ""
echo "=== 2) Panel env + build ==="
cd "$PANEL"
bash scripts/ensure-panel-env.sh
set -a
[ -f .env ] && . ./.env
set +a
export NEXT_PRIVATE_WORKER_THREADS=false
export PANEL_REPO_PATH="$PANEL"
npm ci --include=dev --include=optional
npm run build
bash scripts/prepare-standalone.sh
bash scripts/verify-standalone.sh 2>/dev/null || true

echo ""
echo "=== 3) PM2 restart panel ==="
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
export PANEL_REPO_PATH="$PANEL"
bash scripts/prepare-standalone.sh
[ -f .env ] && cp -f .env .next/standalone/.env && sed -i '/^PANEL_REPO_PATH=/d' .next/standalone/.env 2>/dev/null || true
bash scripts/pm2-start.sh

echo ""
echo "=== 4) Nginx (panel + demo + marketing) ==="
mkdir -p /etc/nginx/conf.d /etc/nginx/sites-available /etc/nginx/sites-enabled
cp "$PANEL/nginx/nexlify-upstream.conf" /etc/nginx/conf.d/nexlify-upstream.conf
cp "$PANEL/nginx/panel.nexlify.live.conf" /etc/nginx/sites-available/panel.nexlify.live
cp "$PANEL/nginx/nexlify.live.conf" /etc/nginx/sites-available/nexlify.live
if [ -f "$PANEL/nginx/panel.demo.nexlify.live.conf" ]; then
  cp "$PANEL/nginx/panel.demo.nexlify.live.conf" /etc/nginx/sites-available/panel.demo.nexlify.live
  if [ -f "/etc/letsencrypt/live/panel.demo.nexlify.live/fullchain.pem" ]; then
    ln -sf /etc/nginx/sites-available/panel.demo.nexlify.live /etc/nginx/sites-enabled/panel.demo.nexlify.live
  else
    echo "WARN: no SSL cert for panel.demo.nexlify.live — skipping demo vhost enable"
    rm -f /etc/nginx/sites-enabled/panel.demo.nexlify.live 2>/dev/null || true
  fi
fi
ln -sf /etc/nginx/sites-available/panel.nexlify.live /etc/nginx/sites-enabled/panel.nexlify.live
ln -sf /etc/nginx/sites-available/nexlify.live /etc/nginx/sites-enabled/nexlify.live
rm -f /etc/nginx/sites-enabled/nexlify-panel-3000 2>/dev/null || true
if ! nginx -t 2>/dev/null; then
  echo "WARN: nginx -t failed — trying HTTP-only panel vhost"
  [ -f "$PANEL/nginx/panel.nexlify.live-http-only.conf" ] && \
    cp "$PANEL/nginx/panel.nexlify.live-http-only.conf" /etc/nginx/sites-available/panel.nexlify.live
  rm -f /etc/nginx/sites-enabled/panel.demo.nexlify.live 2>/dev/null || true
  nginx -t
fi
systemctl reload nginx

echo ""
echo "=== 5) Publish tarball + release feed (v$VER) ==="
cd "$SRC"
npm run sync:releases
SKIP_INSTALL_SCRIPT_PUBLISH=1 bash scripts/publish-panel-release.sh
cp -f "$SRC/marketing-drop-in/src/lib/panel-releases.json" "$MARKETING/src/lib/panel-releases.json"
cd "$MARKETING"
npm run build
pm2 restart nexlify-web --update-env 2>/dev/null || true
pm2 save 2>/dev/null || true

echo ""
echo "=== 6) Health checks ==="
PANEL_PORT="${PORT:-${PANEL_PORT:-13000}}"
fail=0
curl -fsS "http://127.0.0.1:${PANEL_PORT}/api/health" >/dev/null && echo "OK  panel /api/health" || { echo "FAIL panel /api/health"; fail=1; }
curl -fsS "http://127.0.0.1:${PANEL_PORT}/api/panel/version" >/dev/null && echo "OK  panel /api/panel/version" || { echo "FAIL panel /api/panel/version"; fail=1; }
curl -fsS "http://127.0.0.1:${MARKETING_PORT}/api/panel-releases" | grep -q latestVersion && \
  echo "OK  release feed: $(curl -fsS http://127.0.0.1:${MARKETING_PORT}/api/panel-releases | grep -o '"latestVersion":"[^"]*"')" || \
  { echo "FAIL release feed"; fail=1; }
curl -fsSI "http://127.0.0.1:${MARKETING_PORT}/downloads/nexlify-panel.tar.gz" 2>/dev/null | head -1 | grep -q 200 && \
  echo "OK  tarball download" || echo "WARN tarball check"

echo ""
if [ "$fail" -eq 0 ]; then
  echo "=========================================="
  echo " DONE — v$VER live"
  echo " Panel:  https://panel.nexlify.live"
  echo " Demo:   https://panel.demo.nexlify.live"
  echo " Updates: https://panel.nexlify.live/admin/settings/updates"
  echo " Customers can update via Admin -> Settings -> Updates"
  echo "=========================================="
else
  echo "Some checks failed — run: pm2 logs nexlify --lines 40" >&2
  exit 1
fi
