#!/bin/bash
# Quick deploy - run ON the VPS after git pull
# Usage: bash scripts/deploy-vps.sh [panel|marketing|all]
#
# HOST GUARD: resolves panel path via PANEL_DIR / repo root / known install dirs.
# Confirm the resolved path matches the intended VPS before rebuilding.
#
# Panel path resolution (first match wins):
#   1. PANEL_DIR env
#   2. Directory containing this script's repo root
#   3. /home/nexlify (new default)
#   4. /home/nexlify-panel
#   5. /opt/nexlify-panel

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

resolve_panel_dir() {
  if [ -n "${PANEL_DIR:-}" ] && [ -f "${PANEL_DIR}/package.json" ]; then
    echo "$PANEL_DIR"
    return
  fi
  if [ -f "$REPO_ROOT/package.json" ] && [ -d "$REPO_ROOT/scripts" ]; then
    echo "$REPO_ROOT"
    return
  fi
  for candidate in /home/nexlify /home/nexlify-panel /opt/nexlify-panel; do
    if [ -f "$candidate/package.json" ]; then
      echo "$candidate"
      return
    fi
  done
  echo "ERROR: Could not find panel install (set PANEL_DIR=/path/to/panel)" >&2
  exit 1
}

deploy_panel() {
  local dir
  dir="$(resolve_panel_dir)"
  echo ">>> Deploying panel at $dir ..."
  cd "$dir"
  if [ -x scripts/ensure-pg-dump.sh ]; then
    bash scripts/ensure-pg-dump.sh || echo "WARN: pg_dump helper skipped"
  fi
  if [ "${NEXLIFY_SKIP_GIT:-0}" = "1" ]; then
    echo "Skipping git pull (NEXLIFY_SKIP_GIT=1 — using synced files)"
    export NEXLIFY_SKIP_GIT_RESET=1
  else
    git stash push -u -m "deploy-vps pre-pull" >/dev/null 2>&1 || true
    git pull origin main || true
    export NEXLIFY_SKIP_GIT_RESET=1
  fi
  chmod +x scripts/*.sh 2>/dev/null || true
  bash scripts/rebuild-panel-safe.sh
  echo "✅ Panel deployed ($dir)"
}

deploy_marketing() {
  local dir="${MARKETING_DIR:-/var/www/nexlify}"
  if [ ! -f "$dir/package.json" ] && [ -f "$REPO_ROOT/marketing-drop-in/package.json" ]; then
    dir="$REPO_ROOT/marketing-drop-in"
  fi
  if [ ! -f "$dir/package.json" ]; then
    echo ">>> Skipping marketing — no package.json at $dir"
    return 0
  fi
  echo ">>> Deploying marketing site at $dir ..."
  cd "$dir"
  git pull origin main 2>/dev/null || true
  npm install
  npm run build
  pm2 restart nexlify-web || pm2 start npm --name nexlify-web -- start --port 3001
  echo "✅ Marketing site deployed"
}

case "${1:-panel}" in
  panel)
    deploy_panel
    ;;
  marketing)
    deploy_marketing
    ;;
  all)
    deploy_panel
    deploy_marketing
    ;;
  *)
    echo "Usage: bash scripts/deploy-vps.sh [panel|marketing|all]"
    exit 1
    ;;
esac

echo ">>> Done!"
