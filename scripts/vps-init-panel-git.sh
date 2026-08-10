#!/usr/bin/env bash
# Convert /home/nexlify-panel from WinSCP-only files into a git repo tracking GitHub main.
# Preserves .env, data/, backups, and other runtime files.
#
# Run on vendor VPS as root:
#   curl -fsSL https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/vps-init-panel-git.sh | bash
# Or after you have the script:
#   bash /home/nexlify-panel/scripts/vps-init-panel-git.sh
set -euo pipefail

PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
REPO="${NEXLIFY_GIT_REPO:-https://github.com/snookiebaby2022/Nexlify.git}"
BRANCH="${NEXLIFY_GIT_BRANCH:-main}"

PRESERVE=(
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

echo "==> Nexlify panel — init git at $PANEL"
command -v git >/dev/null || { echo "ERROR: install git first (apt install git)"; exit 1; }
[ -d "$PANEL" ] || { echo "ERROR: panel dir missing: $PANEL"; exit 1; }

if [ -d "$PANEL/.git" ]; then
  echo "Already a git repo."
  cd "$PANEL"
  git remote -v 2>/dev/null || git remote add origin "$REPO"
  git fetch origin "$BRANCH" --depth 1 2>/dev/null || git fetch origin "$BRANCH"
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
  git pull origin "$BRANCH" || git reset --hard "origin/$BRANCH"
  echo "Updated to $(git rev-parse --short HEAD) — $(node -p "require('./package.json').version" 2>/dev/null || echo '?')"
  exit 0
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

echo "-> Initializing git and syncing $BRANCH from $REPO"
cd "$PANEL"
git init -b "$BRANCH"
git remote add origin "$REPO"
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
echo "  cd $PANEL && git pull origin main"
echo "  bash scripts/vps-publish-panel-release.sh"
echo "  bash scripts/nexlify-fix-all.sh"
