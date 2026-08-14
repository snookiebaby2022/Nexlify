#!/usr/bin/env bash
# Repair a customer panel so remote-update works: sync origin/main from GitHub and rebuild.
# Does not depend on nexlify.live (which may be stale or Cloudflare-blocked).
#
#   curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/fix-remote-update-now.sh' | sudo bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

find_panel() {
  if [ -n "${PANEL_DIR:-}" ] && [ -f "${PANEL_DIR}/package.json" ]; then
    echo "$PANEL_DIR"
    return 0
  fi
  for d in /opt/nexlify-panel /home/nexlify /home/nexlify-panel; do
    if [ -f "$d/package.json" ] && [ -f "$d/src/lib/panel-server.ts" ]; then
      echo "$d"
      return 0
    fi
  done
  return 1
}

ROOT="$(find_panel)" || {
  echo "ERROR: could not find panel install" >&2
  exit 1
}

echo "=== Nexlify remote-update repair ==="
echo "Dir: $ROOT"
cd "$ROOT"

if [ -d .git ]; then
  echo "==> git fetch origin main"
  git fetch origin main
  git reset --hard origin/main
else
  echo "WARN: not a git checkout — cloning into $ROOT.new then swapping"
  TMP="$(mktemp -d)"
  git clone --depth 1 --branch main https://github.com/snookiebaby2022/Nexlify.git "$TMP/nexlify"
  rsync -a --delete --exclude node_modules --exclude .next --exclude .env --exclude data \
    "$TMP/nexlify/" "$ROOT/"
  rm -rf "$TMP"
fi

if [ -x scripts/deploy-vps.sh ]; then
  bash scripts/deploy-vps.sh panel
else
  npm install --include=dev --no-audit --no-fund
  npx prisma generate || true
  npx prisma migrate deploy || npx prisma db push --accept-data-loss || true
  npm run build
  bash scripts/pm2-start.sh || pm2 restart nexlify --update-env
fi

echo "=== Done. Panel should be on $(node -p "require('./package.json').version") ==="
echo "Remote-update: vendor Admin → Remote Panel Update, force re-sync, URL http://THIS_IP"
