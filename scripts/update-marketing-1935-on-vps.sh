#!/usr/bin/env bash
# Sync nexlify.live marketing site to panel v1.9.35 (run as root on 85.17.162.54).
# Usage:
#   curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/update-marketing-1935-on-vps.sh' | sudo bash
# Or from a checked-out panel repo:
#   sudo bash scripts/update-marketing-1935-on-vps.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
REPO_URL="${NEXLIFY_REPO_URL:-https://github.com/snookiebaby2022/Nexlify.git}"
BRANCH="${NEXLIFY_BRANCH:-main}"
PORT="${MARKETING_PORT:-13001}"

echo "=========================================="
echo " Nexlify marketing → v1.9.35"
echo " Dir: $MARKETING"
echo "=========================================="

if [ ! -d "$MARKETING" ]; then
  echo "ERROR: $MARKETING not found" >&2
  exit 1
fi

# Prefer local panel git; else shallow clone of marketing-drop-in assets
SRC=""
if [ -d "$PANEL/.git" ]; then
  echo "==> Updating panel checkout at $PANEL ..."
  git -C "$PANEL" fetch origin "$BRANCH"
  git -C "$PANEL" reset --hard "origin/$BRANCH"
  SRC="$PANEL"
elif [ -d "/opt/nexlify-panel/.git" ]; then
  PANEL="/opt/nexlify-panel"
  echo "==> Updating panel checkout at $PANEL ..."
  git -C "$PANEL" fetch origin "$BRANCH"
  git -C "$PANEL" reset --hard "origin/$BRANCH"
  SRC="$PANEL"
else
  TMP="$(mktemp -d)"
  echo "==> Shallow clone $REPO_URL ($BRANCH) ..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP/nexlify"
  SRC="$TMP/nexlify"
fi

echo "==> Sync marketing-drop-in → $MARKETING ..."
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .env --exclude src/generated \
  "$SRC/marketing-drop-in/" "$MARKETING/"

# Ensure release metadata + installer version match package
if [ -f "$SRC/src/lib/panel-releases.json" ]; then
  mkdir -p "$MARKETING/src/lib" "$MARKETING/public"
  cp -f "$SRC/src/lib/panel-releases.json" "$MARKETING/src/lib/panel-releases.json"
  cp -f "$SRC/src/lib/panel-releases.json" "$MARKETING/public/panel-releases.json"
fi
if [ -f "$SRC/marketing-drop-in/public/install-command.json" ]; then
  cp -f "$SRC/marketing-drop-in/public/install-command.json" "$MARKETING/public/install-command.json"
fi
if [ -f "$SRC/marketing-drop-in/public/install/panel.sh" ]; then
  mkdir -p "$MARKETING/public/install"
  cp -f "$SRC/marketing-drop-in/public/install/panel.sh" "$MARKETING/public/install/panel.sh"
fi

cd "$MARKETING"
if [ -x "$MARKETING/scripts/ensure-marketing-database-url.sh" ]; then
  bash "$MARKETING/scripts/ensure-marketing-database-url.sh" "$MARKETING" || true
fi
if [ -f "$MARKETING/scripts/load-marketing-env.sh" ]; then
  # shellcheck disable=SC1091
  source "$MARKETING/scripts/load-marketing-env.sh" || true
fi

echo "==> npm install + build ..."
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
npm install --include=dev --no-audit --no-fund
npx prisma generate || true
npx prisma db push --accept-data-loss --skip-generate 2>/dev/null || npx prisma db push --accept-data-loss || true
npm run build

if [ ! -f .next/BUILD_ID ]; then
  echo "ERROR: marketing build failed" >&2
  exit 1
fi

echo "==> Restart PM2 ..."
pm2 restart nexlify-web --update-env 2>/dev/null || \
  pm2 start npm --name nexlify-web --cwd "$MARKETING" -- start -- -H 127.0.0.1 -p "$PORT"
pm2 save 2>/dev/null || true

# Publish panel tarball when panel source is present
if [ -f "$SRC/scripts/publish-panel-release.sh" ]; then
  echo "==> Publishing panel release tarball ..."
  (cd "$SRC" && bash scripts/publish-panel-release.sh) || echo "WARN: publish-panel-release failed (non-fatal)"
fi

VER="$(node -p "try{require('./public/install-command.json').version}catch(e){'?'}")"
echo "=========================================="
echo " Done. install-command version: $VER"
echo " Verify: curl -sk -H 'Host: nexlify.live' https://127.0.0.1/install-command.json"
echo "=========================================="
