#!/usr/bin/env bash
# Sync nexlify.live marketing site to the current panel release (run as root on 85.17.162.54).
# Usage:
#   curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/update-marketing-on-vps.sh' | sudo bash
# Or from a checked-out panel repo:
#   sudo bash scripts/update-marketing-on-vps.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify}"
REPO_URL="${NEXLIFY_REPO_URL:-https://github.com/snookiebaby2022/Nexlify.git}"
BRANCH="${NEXLIFY_BRANCH:-main}"
PORT="${MARKETING_PORT:-13001}"

echo "=========================================="
echo " Nexlify marketing → latest panel release"
echo " Dir: $MARKETING"
echo "=========================================="

if [ ! -d "$MARKETING" ]; then
  echo "ERROR: $MARKETING not found" >&2
  exit 1
fi

# Prefer a throwaway clone of marketing-drop-in so vendor panel checkouts
# can stay IPTV-only (sparse checkout). Do not git-reset the live panel here.
SRC=""
TMP_MKT=""
cleanup_mkt() { [ -n "${TMP_MKT:-}" ] && rm -rf "$TMP_MKT"; }
trap cleanup_mkt EXIT

echo "==> Fetching marketing-drop-in from $REPO_URL ($BRANCH) ..."
TMP_MKT="$(mktemp -d /tmp/nexlify-marketing-src-XXXXXX)"
if git clone --depth 1 --filter=blob:none --sparse --branch "$BRANCH" "$REPO_URL" "$TMP_MKT" \
  && git -C "$TMP_MKT" sparse-checkout set marketing-drop-in scripts src; then
  git -C "$TMP_MKT" checkout HEAD -- package.json 2>/dev/null || true
  SRC="$TMP_MKT"
else
  echo "WARN: sparse clone failed — full depth-1 clone" >&2
  rm -rf "$TMP_MKT"
  TMP_MKT="$(mktemp -d /tmp/nexlify-marketing-src-XXXXXX)"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP_MKT"
  SRC="$TMP_MKT"
fi

if [ ! -d "$SRC/marketing-drop-in" ]; then
  echo "ERROR: marketing-drop-in missing from clone" >&2
  exit 1
fi

# Panel version from the live panel install when present
PANEL_PKG=""
for d in /home/nexlify-panel /opt/nexlify-panel /home/nexlify; do
  if [ -f "$d/package.json" ]; then PANEL_PKG="$d"; break; fi
done


echo "==> Sync marketing-drop-in → $MARKETING ..."
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .env --exclude src/generated \
  --exclude public/downloads \
  "$SRC/marketing-drop-in/" "$MARKETING/"

# Ensure release metadata + installer version match the panel package (never leave stale install-command.json)
PANEL_VER="$(node -e 'try{process.stdout.write(require(process.argv[1]+"/package.json").version||"")}catch(e){}' "${PANEL_PKG:-$SRC}" 2>/dev/null || true)"
if [ -z "${PANEL_VER:-}" ] && [ -f "$SRC/src/lib/panel-releases.json" ]; then
  PANEL_VER="$(node -e 'try{process.stdout.write(require(process.argv[1]).latestVersion||"")}catch(e){}' "$SRC/src/lib/panel-releases.json" 2>/dev/null || true)"
fi
if [ -z "${PANEL_VER:-}" ]; then
  PANEL_VER="0.0.0"
fi

if [ -f "$SRC/scripts/sync-install-to-marketing.sh" ]; then
  echo "==> Syncing installer scripts to panel v${PANEL_VER} ..."
  (cd "$SRC" && bash scripts/sync-install-to-marketing.sh) || true
  mkdir -p "$MARKETING/public/install"
  rsync -a "$SRC/marketing-drop-in/public/install/" "$MARKETING/public/install/" 2>/dev/null || true
fi

if [ -f "$SRC/src/lib/panel-releases.json" ]; then
  mkdir -p "$MARKETING/src/lib" "$MARKETING/public"
  cp -f "$SRC/src/lib/panel-releases.json" "$MARKETING/src/lib/panel-releases.json"
  cp -f "$SRC/src/lib/panel-releases.json" "$MARKETING/public/panel-releases.json"
fi

# Always rewrite install-command.json from panel version (static JSON is what the site UI loads first)
mkdir -p "$MARKETING/public"
cat > "$MARKETING/public/install-command.json" << EOF
{
  "version": "${PANEL_VER}",
  "label": "v${PANEL_VER}",
  "url": "https://nexlify.live/install/panel.sh?v=${PANEL_VER}",
  "command": "curl -fsSL 'https://nexlify.live/install/panel.sh?v=${PANEL_VER}' | sudo bash"
}
EOF
if [ -f "$MARKETING/public/install/panel.sh" ]; then
  sed -i "s|panel\.sh?v=[0-9.a-zA-Z]*|panel.sh?v=${PANEL_VER}|g" "$MARKETING/public/install/panel.sh" 2>/dev/null || true
  sed -i "s/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v[^\"]*}\"/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v${PANEL_VER}}\"/" \
    "$MARKETING/public/install/panel.sh" \
    "$MARKETING/public/install/apply-panel-fast-update.sh" 2>/dev/null || true
fi
# Keep marketing package.json version aligned with panel release
if [ -f "$MARKETING/package.json" ] && [ -n "${PANEL_VER}" ] && [ "${PANEL_VER}" != "0.0.0" ]; then
  node -e "const fs=require('fs');const p='$MARKETING/package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version='$PANEL_VER';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')"
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

# Publish from the live IPTV panel tree (full source). Do not package the
# throwaway marketing clone — that checkout is sparse and incomplete.
PUBLISH_ROOT=""
for d in /home/nexlify-panel /opt/nexlify-panel /home/nexlify; do
  if [ -f "$d/scripts/publish-panel-release.sh" ] && [ -f "$d/package.json" ] && [ -d "$d/src" ]; then
    PUBLISH_ROOT="$d"
    break
  fi
done
# Skip tarball publish unless explicitly requested — marketing clone is not a panel tree.
if [ "${NEXLIFY_SKIP_PANEL_PUBLISH:-1}" = "1" ]; then
  echo "==> Skipping panel tarball publish (NEXLIFY_SKIP_PANEL_PUBLISH=1)"
elif [ -n "$PUBLISH_ROOT" ]; then
  echo "==> Publishing panel release tarball from $PUBLISH_ROOT ..."
  (cd "$PUBLISH_ROOT" && bash scripts/publish-panel-release.sh) || echo "WARN: publish-panel-release failed (non-fatal)"
elif [ -f "$SRC/scripts/publish-panel-release.sh" ]; then
  echo "==> Publishing panel release tarball from clone ..."
  (cd "$SRC" && bash scripts/publish-panel-release.sh) || echo "WARN: publish-panel-release failed (non-fatal)"
fi

VER="$(node -e 'try{process.stdout.write(require("./public/install-command.json").version||"?")}catch(e){process.stdout.write("?")}')"
echo "=========================================="
echo " Done. install-command version: $VER"
echo " Verify: curl -sk -H 'Host: nexlify.live' https://127.0.0.1/install-command.json"
echo "=========================================="
