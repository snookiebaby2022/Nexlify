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
PANEL_UPSTREAM_PORT="${PANEL_PORT:-13000}"
MARKETING_PORT="${MARKETING_PORT:-13001}"

read_panel_upstream_port() {
  local from_env=""
  if [ -f "$PANEL/.env" ]; then
    from_env="$(grep -E '^(PORT|PANEL_PORT)=' "$PANEL/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]' || true)"
  fi
  echo "${from_env:-${PANEL_UPSTREAM_PORT:-13000}}"
}

panel_health_ok() {
  local port="$1"
  local body
  body="$(curl -fsS "http://127.0.0.1:${port}/api/health" 2>/dev/null || true)"
  [ -n "$body" ] || return 1
  echo "$body" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"' || return 1
  echo "$body" | grep -q 'nexlify-marketing' && return 1
  return 0
}

panel_version_ok() {
  local port="$1"
  local body
  body="$(curl -fsS "http://127.0.0.1:${port}/api/panel/version" 2>/dev/null || true)"
  [ -n "$body" ] || return 1
  echo "$body" | grep -qE '"version"[[:space:]]*:[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+"' || return 1
  return 0
}

ensure_marketing_pm2() {
  local port="$1"
  echo "-> Ensuring nexlify-web on 127.0.0.1:${port} (cwd: $MARKETING)"
  cd "$MARKETING"
  touch .env
  sed -i 's/\r$//' .env 2>/dev/null || true
  if grep -q '^PORT=' .env 2>/dev/null; then
    sed -i "s|^PORT=.*|PORT=${port}|" .env
  else
    echo "PORT=${port}" >> .env
  fi
  if grep -q '^HOSTNAME=' .env 2>/dev/null; then
    sed -i 's|^HOSTNAME=.*|HOSTNAME=127.0.0.1|' .env
  else
    echo "HOSTNAME=127.0.0.1" >> .env
  fi
  if [ -f "$PANEL/scripts/ensure-marketing-env.sh" ]; then
    bash "$PANEL/scripts/ensure-marketing-env.sh" "$MARKETING" 2>/dev/null || true
  fi
  if [ ! -d node_modules/next ]; then
    echo "-> Marketing npm install ..."
    npm install --no-audit --no-fund --loglevel=error
  fi
  pm2 delete nexlify-web 2>/dev/null || true
  pm2 start npm --name nexlify-web --cwd "$MARKETING" -- start -- -H 127.0.0.1 -p "$port"
  pm2 save 2>/dev/null || true
  echo "-> Waiting for nexlify-web on :${port} ..."
  for _ in $(seq 1 45); do
    if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
      return 0
    fi
    sleep 2
  done
  echo "WARN: nexlify-web not listening on :${port} — release feed still served from nginx static JSON" >&2
  pm2 logs nexlify-web --lines 30 --nostream 2>/dev/null || true
  return 1
}

curl_nginx() {
  local path="$1"
  curl -fsSk "https://127.0.0.1${path}" -H "Host: nexlify.live" 2>/dev/null \
    || curl -fsS "http://127.0.0.1${path}" -H "Host: nexlify.live" 2>/dev/null
}

curl_nginx_code() {
  local path="$1"
  curl -fsSk -o /dev/null -w '%{http_code}' "https://127.0.0.1${path}" -H "Host: nexlify.live" 2>/dev/null \
    || curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1${path}" -H "Host: nexlify.live" 2>/dev/null \
    || echo "000"
}

feed_latest_version() {
  node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try { console.log(JSON.parse(d).latestVersion || ''); }
      catch { console.log(''); }
    });
  " 2>/dev/null
}

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
echo "=== 2) Panel env + build (release candidate verify) ==="
cd "$PANEL"
bash scripts/ensure-panel-env.sh
set -a
[ -f .env ] && . ./.env
set +a
export NEXT_PRIVATE_WORKER_THREADS=false
export PANEL_REPO_PATH="$PANEL"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
npm ci --include=dev --include=optional
bash scripts/verify-release-candidate.sh

echo ""
echo "=== 3) PM2 restart panel ==="
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
export PANEL_REPO_PATH="$PANEL"
bash scripts/prepare-standalone.sh
bash scripts/pm2-start.sh
PANEL_UPSTREAM_PORT="$(read_panel_upstream_port)"
echo "   Panel upstream: 127.0.0.1:${PANEL_UPSTREAM_PORT}"

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
echo "=== 5) Publish tarball + release feed + install scripts (v$VER) ==="
cd "$SRC"
npm run sync:releases
bash scripts/sync-install-to-marketing.sh
SKIP_INSTALL_SCRIPT_PUBLISH=1 bash scripts/publish-panel-release.sh
mkdir -p "$MARKETING/public/install" "$MARKETING/public/downloads"
rsync -a "$SRC/marketing-drop-in/public/install/" "$MARKETING/public/install/"
cp -f "$SRC/marketing-drop-in/src/lib/panel-releases.json" "$MARKETING/src/lib/panel-releases.json"
cp -f "$SRC/marketing-drop-in/src/lib/panel-releases.json" "$MARKETING/public/panel-releases.json"
cp -f "$SRC/src/lib/panel-releases.json" "$MARKETING/public/panel-releases.json"
sed -i 's/\r$//' "$MARKETING/public/install"/*.sh "$MARKETING/public/install"/scripts/*.sh 2>/dev/null || true
chmod -R a+rX "$MARKETING/public/downloads" "$MARKETING/public/install" 2>/dev/null || true
chmod +x "$MARKETING/public/install"/*.sh "$MARKETING/public/install"/scripts/*.sh 2>/dev/null || true
PUBLIC_IP="${PANEL_VENDOR_IP:-$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)}"
if [ -n "$PUBLIC_IP" ]; then
  cat > "$MARKETING/public/install/panel-vendor-origin.env" << EOF
PANEL_VENDOR_IP=${PUBLIC_IP}
PANEL_VENDOR_HOST=nexlify.live
EOF
  chmod 644 "$MARKETING/public/install/panel-vendor-origin.env"
  echo "   Origin bypass file: panel-vendor-origin.env (IP ${PUBLIC_IP})"
fi
for required in \
  "$MARKETING/public/downloads/nexlify-panel.tar.gz" \
  "$MARKETING/public/install/apply-panel-fast-update.sh" \
  "$MARKETING/public/install/fix-panel-down-now.sh" \
  "$MARKETING/public/install/fix-customer-panel.sh" \
  "$MARKETING/public/install/scripts/panel-update-background.sh" \
  "$MARKETING/public/install/scripts/fix-update-worker-now.sh"; do
  if [ ! -f "$required" ]; then
    echo "ERROR: publish incomplete — missing $required" >&2
    exit 1
  fi
done
TARBALL="$MARKETING/public/downloads/nexlify-panel.tar.gz"
TARBALL_SIZE="$(wc -c < "$TARBALL" | tr -d '[:space:]')"
if [ -z "$TARBALL_SIZE" ] || [ "$TARBALL_SIZE" -lt 500000 ]; then
  echo "ERROR: tarball too small (${TARBALL_SIZE:-0} bytes) — publish failed" >&2
  exit 1
fi
echo "   Tarball published: $TARBALL ($(( TARBALL_SIZE / 1024 / 1024 ))MB)"
cp -f "$SRC/marketing-drop-in/src/lib/panel-releases.json" "$MARKETING/src/lib/panel-releases.json"
cd "$MARKETING"
if [ -x "$MARKETING/scripts/ensure-marketing-database-url.sh" ]; then
  bash "$MARKETING/scripts/ensure-marketing-database-url.sh" "$MARKETING" || true
fi
# shellcheck disable=SC1091
[ -f "$MARKETING/scripts/load-marketing-env.sh" ] && source "$MARKETING/scripts/load-marketing-env.sh" || true
npx prisma generate >/dev/null 2>&1 || true
npx prisma db push --accept-data-loss --skip-generate >/dev/null 2>&1 || true
npm run build
ensure_marketing_pm2 "$MARKETING_PORT" || true

echo ""
echo "=== 6) Health checks ==="
# Do NOT use $PORT here — marketing .env sets PORT=13001 and poisons panel checks.
PANEL_UPSTREAM_PORT="$(read_panel_upstream_port)"
TARBALL="$MARKETING/public/downloads/nexlify-panel.tar.gz"
fail=0
if panel_health_ok "$PANEL_UPSTREAM_PORT"; then
  echo "OK  panel /api/health (:${PANEL_UPSTREAM_PORT})"
else
  echo "FAIL panel /api/health (:${PANEL_UPSTREAM_PORT})"
  fail=1
fi
if panel_version_ok "$PANEL_UPSTREAM_PORT"; then
  PANEL_VER="$(curl -fsS "http://127.0.0.1:${PANEL_UPSTREAM_PORT}/api/panel/version" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).version||'')}catch{}})" 2>/dev/null || true)"
  echo "OK  panel /api/panel/version (:${PANEL_UPSTREAM_PORT}${PANEL_VER:+, v${PANEL_VER}})"
else
  echo "FAIL panel /api/panel/version (:${PANEL_UPSTREAM_PORT})"
  fail=1
fi
FEED_VER="$(curl_nginx /api/panel-releases 2>/dev/null | feed_latest_version)"
if [ -z "$FEED_VER" ]; then
  FEED_VER="$(curl -fsS "http://127.0.0.1:${MARKETING_PORT}/api/panel-releases" 2>/dev/null | feed_latest_version || true)"
fi
if [ -n "$FEED_VER" ]; then
  echo "OK  release feed latestVersion=$FEED_VER"
else
  echo "FAIL release feed (nginx + nexlify-web :${MARKETING_PORT})"
  fail=1
fi
if [ -s "$TARBALL" ] && [ "$(wc -c < "$TARBALL" | tr -d '[:space:]')" -gt 500000 ]; then
  TARBALL_HTTP="$(curl_nginx_code /downloads/nexlify-panel.tar.gz)"
  if [ "$TARBALL_HTTP" = "200" ]; then
    echo "OK  tarball download (nginx, HTTP 200, $(du -h "$TARBALL" | cut -f1))"
  else
    echo "FAIL tarball download (nginx HTTP ${TARBALL_HTTP:-000}, file on disk: $(du -h "$TARBALL" | cut -f1))"
    fail=1
  fi
else
  echo "FAIL tarball missing or too small on disk: $TARBALL"
  fail=1
fi
curl_nginx /install/apply-panel-fast-update.sh | grep -q apply-panel-fast-update && \
  echo "OK  apply-panel-fast-update.sh (nginx)" || \
  { echo "FAIL apply-panel-fast-update.sh (nginx)"; fail=1; }
curl_nginx /install/scripts/fix-update-worker-now.sh | grep -q fix-update-worker-now && \
  echo "OK  install hotfix script (nginx)" || \
  { echo "FAIL install hotfix script (nginx)"; fail=1; }
curl_nginx /install/scripts/panel-update-background.sh | grep -q panel-update-background && \
  echo "OK  update worker launcher (nginx)" || \
  { echo "FAIL update worker launcher (nginx)"; fail=1; }
curl_nginx /install/fix-customer-panel.sh | grep -q 'customer panel repair' && \
  echo "OK  fix-customer-panel.sh (nginx)" || \
  { echo "FAIL fix-customer-panel.sh (nginx)"; fail=1; }
if curl_nginx /install/fix-panel-down-now.sh 2>/dev/null | grep -q 'fix-panel-down-now'; then
  echo "OK  fix-panel-down-now.sh (nginx)"
elif curl_nginx /install/scripts/fix-panel-down-now.sh 2>/dev/null | grep -q 'fix-panel-down-now'; then
  echo "OK  fix-panel-down-now.sh (nginx, /install/scripts/ fallback)"
else
  echo "FAIL fix-panel-down-now.sh (nginx) — missing on disk or nginx not serving it"
  [ -f "$MARKETING/public/install/fix-panel-down-now.sh" ] || \
    echo "      disk: missing $MARKETING/public/install/fix-panel-down-now.sh" >&2
  fail=1
fi

echo ""
echo "=== Public internet checks (Cloudflare — customer VPS sees these) ==="
pub_fail=0
pub_code="$(curl -fsS -o /dev/null -w '%{http_code}' -A 'NexlifyPanelUpdater/1.0' 'https://nexlify.live/downloads/nexlify-panel.tar.gz' 2>/dev/null || echo 000)"
if [ "$pub_code" = "200" ]; then
  echo "OK  public tarball (HTTP 200)"
else
  echo "FAIL public tarball (HTTP ${pub_code}) — Cloudflare blocking customer updates!"
  echo "      Run: bash scripts/vps-fix-cloudflare-downloads.sh"
  pub_fail=1
fi
pub_code="$(curl -fsS -o /dev/null -w '%{http_code}' -A 'NexlifyPanelUpdater/1.0' 'https://nexlify.live/api/panel-releases' 2>/dev/null || echo 000)"
if [ "$pub_code" = "200" ]; then
  echo "OK  public release feed (HTTP 200)"
else
  echo "FAIL public release feed (HTTP ${pub_code})"
  pub_fail=1
fi
if [ "$pub_fail" -ne 0 ]; then
  echo ""
  echo "WARN: Fix Cloudflare WAF/bot fight for /downloads/ and /install/ (see scripts/vps-fix-cloudflare-downloads.sh)"
  fail=1
fi

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
