#!/usr/bin/env bash
# Convert /home/nexlify-panel from WinSCP-only files into a git repo tracking GitHub main.
# Preserves .env, data/, backups, and other runtime files.
#
# Private repo: export GITHUB_TOKEN=ghp_... first (PAT with repo read access).
#
# Run on vendor VPS as root:
#   curl -fsSL https://nexlify.live/install/vps-init-panel-git.sh | bash
# Or:
#   bash /home/nexlify-panel/scripts/vps-init-panel-git.sh
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

PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
BRANCH="${NEXLIFY_GIT_BRANCH:-main}"

REPO_URL="$(resolve_nexlify_git_url)"
  .env
  .env.local
  .env.production
  .env.development
  data
  backups
  node_modules
  .next
  .panel-update-cache.json
  .update-progress.json
)

REPO_URL="$(resolve_nexlify_git_url)"

echo "==> Nexlify panel — init git at $PANEL"
command -v git >/dev/null || { echo "ERROR: install git first (apt install git)"; exit 1; }
[ -d "$PANEL" ] || { echo "ERROR: panel dir missing: $PANEL"; exit 1; }

if [ -d "$PANEL/.git" ]; then
  echo "Already a git repo."
  cd "$PANEL"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REPO_URL"
  git remote set-url origin "$REPO_URL"
  if ! git fetch origin "$BRANCH" --depth 1 2>/dev/null; then
    require_git_auth_hint
    exit 1
  fi
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
  echo "Updated to $(git rev-parse --short HEAD) — $(node -p "require('./package.json').version" 2>/dev/null || echo '?')"
  exit 0
fi

if ! git_fetch_ok "$REPO_URL" "$BRANCH"; then
  require_git_auth_hint
  exit 1
fi

BACKUP="$(mktemp -d /root/nexlify-panel-git-backup.XXXXXX)"
echo "-> Backing up local runtime files to $BACKUP"
for item in "${PRESERVE[@]}"; do
  if [ -e "$PANEL/$item" ]; then
    mkdir -p "$BACKUP/$(dirname "$item")"
    cp -a "$PANEL/$item" "$BACKUP/$item"
    echo "   kept $item"
  fi
done

echo "-> Initializing git and syncing $BRANCH"
cd "$PANEL"
git init -b "$BRANCH"
git remote add origin "$REPO_URL"
git fetch origin "$BRANCH" --depth 1
git reset --hard "origin/$BRANCH"

echo "-> Restoring preserved files"
for item in "${PRESERVE[@]}"; do
  if [ -e "$BACKUP/$item" ]; then
    rm -rf "$PANEL/$item"
    mkdir -p "$PANEL/$(dirname "$item")"
    cp -a "$BACKUP/$item" "$PANEL/$item"
    echo "   restored $item"
  fi
done

git config pull.rebase false
git config --local advice.detachedHead false

VER="$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)"
echo ""
echo "Done — $PANEL is now a git repo on $BRANCH (v$VER)."
echo "Backup of preserved files: $BACKUP"
echo ""
echo "Day-to-day commands:"
echo "  export GITHUB_TOKEN=ghp_...   # if using HTTPS token"
echo "  cd $PANEL && git pull origin main"
echo "  bash scripts/vps-publish-panel-release.sh"
