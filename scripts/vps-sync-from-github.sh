#!/usr/bin/env bash
# Canonical VPS sync — align panel + marketing with GitHub main, publish, verify.
# Run on vendor VPS as root after setting GITHUB_TOKEN (repo read):
#
#   export GITHUB_TOKEN=ghp_...
#   curl -fsSL 'https://nexlify.live/install/vps-sync-from-github.sh' | bash
# Or:
#   bash /home/nexlify-panel/scripts/vps-sync-from-github.sh
#
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify}"
MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
BRANCH="${NEXLIFY_GIT_BRANCH:-main}"
STAGE="/tmp/nexlify-github-sync-$$"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

resolve_git_url() {
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
echo " VPS sync from GitHub ($BRANCH)"
echo " Panel:     $PANEL"
echo " Marketing: $MARKETING"
echo "=========================================="

echo "==> 1) Clone fresh from GitHub ..."
rm -rf "$STAGE"
git clone --depth 1 --branch "$BRANCH" "$(resolve_git_url)" "$STAGE"

echo "==> 2) Rsync panel (keep .env + data/) ..."
mkdir -p "$PANEL"
rsync -a --delete \
  --exclude='.env' --exclude='.env.*' \
  --exclude='data/' --exclude='node_modules/' \
  --exclude='.next/' --exclude='.next.backup/' --exclude='.next.staging/' \
  --exclude='.git/' \
  "$STAGE/" "$PANEL/"

echo "==> 3) Rsync marketing drop-in (keep .env) ..."
mkdir -p "$MARKETING"
rsync -a --delete \
  --exclude='.env' --exclude='.env.*' \
  --exclude='node_modules/' --exclude='.next/' \
  --exclude='.git/' \
  "$STAGE/marketing-drop-in/" "$MARKETING/"

echo "==> 4) Cleanup stale VPS artifacts ..."
if [ -x "$PANEL/scripts/nexlify-vps-cleanup.sh" ]; then
  bash "$PANEL/scripts/nexlify-vps-cleanup.sh" || true
fi
rm -rf "$PANEL/.next.staging" "$PANEL/.update-progress.pid" "$PANEL/.update-in-progress" 2>/dev/null || true
rm -f "$PANEL/.update-worker-err.log" 2>/dev/null || true

echo "==> 5) Full vendor repair + publish (v$(
  node -p "require('$PANEL/package.json').version" 2>/dev/null || echo '?'
)) ..."
bash "$PANEL/scripts/vps-fix-everything.sh"

echo "==> 6) Verify marketing site ..."
if [ -x "$MARKETING/scripts/fix-marketing-now.sh" ]; then
  bash "$MARKETING/scripts/fix-marketing-now.sh"
else
  echo "WARN: fix-marketing-now.sh missing — marketing may need manual rebuild"
fi

echo ""
echo "=========================================="
echo " VPS SYNC COMPLETE"
echo " GitHub main → panel + marketing aligned"
echo " Version: $(node -p "require('$PANEL/package.json').version" 2>/dev/null || echo '?')"
echo "=========================================="
