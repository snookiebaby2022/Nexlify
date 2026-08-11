#!/usr/bin/env bash
# Publish panel tarball + release feed for in-app panel updates.
# Works even when /home/nexlify-panel has no git (WinSCP-only deploys).
#
# Private repo: export GITHUB_TOKEN=ghp_... first (PAT with repo read access).
# To enable git on VPS: bash scripts/vps-init-panel-git.sh
#
# Run on vendor VPS as root:
#   curl -fsSL https://nexlify.live/install/vps-publish-panel-release.sh | bash
# Or:
#   bash /root/vps-publish-panel-release.sh
set -euo pipefail

# --- git auth (inline so curl | bash works) ---
resolve_nexlify_git_url() {
  local base="${NEXLIFY_GIT_REPO:-https://github.com/snookiebaby2022/Nexlify.git}"
  local token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  if [ -n "$token" ]; then
    echo "https://${token}@github.com/snookiebaby2022/Nexlify.git"
    return 0
  fi
  if [ -n "${NEXLIFY_GIT_SSH:-}" ] || [ -f "${HOME}/.ssh/id_ed25519" ] || [ -f "${HOME}/.ssh/id_rsa" ]; then
    if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | grep -qi 'successfully authenticated'; then
      echo "git@github.com:snookiebaby2022/Nexlify.git"
      return 0
    fi
  fi
  echo "$base"
}
require_git_auth_hint() {
  cat <<'EOF'
ERROR: Cannot access private GitHub repo snookiebaby2022/Nexlify.

Fix one of:
  1) export GITHUB_TOKEN=ghp_...   # PAT with repo read scope, then re-run
  2) Add SSH deploy key to GitHub, export NEXLIFY_GIT_SSH=1, then re-run
  3) WinSCP upload scripts from your PC instead of curl GitHub raw URLs
EOF
}
git_fetch_ok() {
  git ls-remote "$1" "refs/heads/${2:-main}" >/dev/null 2>&1
}
# --- end git auth ---

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
BRANCH="${NEXLIFY_GIT_BRANCH:-main}"
PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"

REPO_URL="$(resolve_nexlify_git_url)"

echo "==> Nexlify panel publish (in-app update feed + tarball)"
[ -d "$MARKETING" ] || { echo "ERROR: marketing dir missing: $MARKETING"; exit 1; }
command -v git >/dev/null || { echo "ERROR: git not installed — apt install git"; exit 1; }
command -v node >/dev/null || { echo "ERROR: node not installed"; exit 1; }

WORK_DIR=""

resolve_source() {
  if [ -d "$PANEL/.git" ] && [ -f "$PANEL/scripts/publish-panel-release.sh" ]; then
    echo "-> Updating existing git checkout at $PANEL" >&2
    git -C "$PANEL" remote set-url origin "$REPO_URL" 2>/dev/null || true
    if ! git -C "$PANEL" fetch origin "$BRANCH" --depth 1 >/dev/null 2>&1; then
      require_git_auth_hint
      exit 1
    fi
    git -C "$PANEL" reset --hard "origin/$BRANCH" >/dev/null 2>&1
    echo "$PANEL"
    return 0
  fi

  if ! git_fetch_ok "$REPO_URL" "$BRANCH"; then
    require_git_auth_hint
    exit 1
  fi

  WORK_DIR="$(mktemp -d /tmp/nexlify-publish-src.XXXXXX)"
  echo "-> No git in $PANEL — cloning to $WORK_DIR" >&2
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$WORK_DIR/nexlify" >/dev/null 2>&1
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

echo "-> Sync installer scripts to marketing public/install"
bash scripts/sync-install-to-marketing.sh
mkdir -p "$MARKETING/public/install"
rsync -a marketing-drop-in/public/install/ "$MARKETING/public/install/"
sed -i 's/\r$//' "$MARKETING/public/install"/*.sh "$MARKETING/public/install"/scripts/*.sh 2>/dev/null || true
chmod +x "$MARKETING/public/install"/*.sh "$MARKETING/public/install"/scripts/*.sh 2>/dev/null || true

echo "-> Build and publish source tarball"
SKIP_INSTALL_SCRIPT_PUBLISH=1 bash scripts/publish-panel-release.sh

# Keep the source tarball inside the marketing source tree so the full-site rsync --delete does not remove it.
mkdir -p "${SRC}/marketing-drop-in/public/downloads"
cp -f "${PANEL_PUBLISH_DEST:-/var/www/nexlify/public/downloads/nexlify-panel.tar.gz}" "${SRC}/marketing-drop-in/public/downloads/nexlify-panel.tar.gz"

echo "-> Build and publish prebuilt .next archive"
bash scripts/build-prebuilt-download.sh "${SRC}/dist/next-${VER}.tar.gz" "${VER}"
mkdir -p "${MARKETING}/public/downloads" "${SRC}/marketing-drop-in/public/downloads"
cp -f "${SRC}/dist/next-${VER}.tar.gz" "${MARKETING}/public/downloads/next-${VER}.tar.gz"
cp -f "${SRC}/dist/next-${VER}.tar.gz" "${SRC}/marketing-drop-in/public/downloads/next-${VER}.tar.gz"

echo "-> Sync marketing site source and rebuild"
# Sync canonical marketing source so visual/content updates from GitHub are live.
rsync -a --delete \
  --exclude=.git \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.env \
  --exclude=.env.local \
  "$SRC/marketing-drop-in/" "$MARKETING/"
cp -f "$SRC/src/lib/panel-releases.json" "$MARKETING/src/lib/panel-releases.json"
cp -f "$SRC/src/lib/panel-releases.json" "$MARKETING/public/panel-releases.json"
cd "$MARKETING"
# Ensure deps match the updated source.
npm ci --no-audit --no-fund --loglevel=error 2>/dev/null || npm install --no-audit --no-fund --loglevel=error 2>/dev/null || true
npm run build
pm2 delete nexlify-web 2>/dev/null || true
pm2 start npm --name nexlify-web --cwd "$MARKETING" -- start -- -H 127.0.0.1 -p 13001
pm2 save 2>/dev/null || true

echo ""
echo "Verify:"
curl -fsS "http://127.0.0.1:13001/api/panel-releases" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log('latestVersion:',j.latestVersion)}catch(e){console.log(d.slice(0,200))}})" || true
curl -fsSI "http://127.0.0.1:13001/downloads/nexlify-panel.tar.gz" 2>/dev/null | head -3 || true
echo ""
echo "Done — customer panels can update via Admin → Settings → Updates to v$VER"
