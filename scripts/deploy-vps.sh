#!/bin/bash
# Quick deploy - run ON the VPS after git pull
# Usage: bash scripts/deploy-vps.sh [panel|marketing|all]
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
  git pull origin main || true
  chmod +x scripts/*.sh 2>/dev/null || true
  npm install --include=dev --no-audit --no-fund
  if command -v npx >/dev/null 2>&1 && [ -d prisma ]; then
    npx prisma generate
    npx prisma migrate deploy
    if [ -x scripts/verify-db-schema.sh ]; then
      bash scripts/verify-db-schema.sh
    else
      node scripts/audit-db-schema.cjs
    fi
  fi
  # Always stage when a live .next exists (run-panel-build.mjs) — never race PM2.
  npm run build
  if [ -x scripts/pm2-start.sh ]; then
    bash scripts/pm2-start.sh
  elif [ -x scripts/panel-restart-safe.sh ]; then
    bash scripts/panel-restart-safe.sh
  else
    pm2 restart nexlify || pm2 start npm --name nexlify -- start
  fi
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
