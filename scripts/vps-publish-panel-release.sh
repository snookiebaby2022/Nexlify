#!/usr/bin/env bash
# Publish panel tarball + release feed for in-app panel updates.
# Works even when /home/nexlify-panel has no git (WinSCP-only deploys).
# To enable git on VPS: bash scripts/vps-init-panel-git.sh
#
# Run on vendor VPS as root:
#   curl -fsSL https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/vps-publish-panel-release.sh | bash
# Or:
#   bash /root/vps-publish-panel-release.sh
set -euo pipefail

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
REPO="${NEXLIFY_GIT_REPO:-https://github.com/snookiebaby2022/Nexlify.git}"
BRANCH="${NEXLIFY_GIT_BRANCH:-main}"
PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"

echo "==> Nexlify panel publish (in-app update feed + tarball)"
[ -d "$MARKETING" ] || { echo "ERROR: marketing dir missing: $MARKETING"; exit 1; }
command -v git >/dev/null || { echo "ERROR: git not installed — apt install git"; exit 1; }
command -v node >/dev/null || { echo "ERROR: node not installed"; exit 1; }

WORK_DIR=""

resolve_source() {
  # Prefer live git pull when panel dir is a repo and already on latest semver.
  if [ -d "$PANEL/.git" ] && [ -f "$PANEL/scripts/publish-panel-release.sh" ]; then
    echo "-> Updating existing git checkout at $PANEL"
    git -C "$PANEL" fetch origin "$BRANCH" --depth 1 2>/dev/null || git -C "$PANEL" pull origin "$BRANCH"
    echo "$PANEL"
    return 0
  fi

  # WinSCP / no-git installs: clone fresh source to a temp dir.
  WORK_DIR="$(mktemp -d /tmp/nexlify-publish-src.XXXXXX)"
  echo "-> No git in $PANEL — cloning $REPO ($BRANCH) to $WORK_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$WORK_DIR/nexlify"
  echo "$WORK_DIR/nexlify"
}

SRC="$(resolve_source)"
cleanup() {
  [ -n "$WORK_DIR" ] && rm -rf "$WORK_DIR"
}
trap cleanup EXIT

cd "$SRC"
VER="$(node -p "require('./package.json').version")"
echo "Panel source version: $VER"

echo "-> Sync panel-releases.json to marketing drop-in"
npm run sync:releases

echo "-> Build and publish tarball"
SKIP_INSTALL_SCRIPT_PUBLISH=1 bash scripts/publish-panel-release.sh

echo "-> Rebuild marketing site (panel-releases API)"
cp -f "$SRC/marketing-drop-in/src/lib/panel-releases.json" "$MARKETING/src/lib/panel-releases.json"
cd "$MARKETING"
npm run build
pm2 restart nexlify-web --update-env
pm2 save 2>/dev/null || true

echo ""
echo "Verify:"
curl -fsS "http://127.0.0.1:13001/api/panel-releases" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log('latestVersion:',j.latestVersion)}catch(e){console.log(d.slice(0,200))}})" || true
curl -fsSI "http://127.0.0.1:13001/downloads/nexlify-panel.tar.gz" 2>/dev/null | head -3 || true
echo ""
echo "Done — customer panels can update via Admin → Settings → Updates to v$VER"
