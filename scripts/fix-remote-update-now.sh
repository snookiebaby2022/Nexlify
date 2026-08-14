#!/usr/bin/env bash
# Repair a customer panel so remote-update works: restart Postgres if needed,
# sync origin/main from GitHub, and rebuild. Does not depend on nexlify.live
# (which may be stale or Cloudflare-blocked).
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

restart_postgres() {
  echo "==> Ensuring PostgreSQL is running"
  systemctl restart postgresql 2>/dev/null || \
    systemctl restart postgresql.service 2>/dev/null || \
    systemctl restart postgresql@16-main 2>/dev/null || \
    systemctl restart postgresql@15-main 2>/dev/null || \
    service postgresql restart 2>/dev/null || true
  systemctl restart redis-server 2>/dev/null || systemctl restart redis 2>/dev/null || service redis-server restart 2>/dev/null || true
  sleep 3
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -q && echo "Postgres: ready" || echo "WARN: pg_isready failed — panel update will still try git sync"
  fi
}

ROOT="$(find_panel)" || {
  echo "ERROR: could not find panel install" >&2
  exit 1
}

echo "=== Nexlify remote-update repair ==="
echo "Dir: $ROOT"
cd "$ROOT"

restart_postgres

if [ -d .git ]; then
  echo "==> git fetch origin main"
  git fetch origin main
  git reset --hard origin/main
else
  echo "WARN: not a git checkout — cloning into staging then swapping (keeps .env + data + .git)"
  TMP="$(mktemp -d)"
  git clone --depth 1 --branch main https://github.com/snookiebaby2022/Nexlify.git "$TMP/nexlify"
  rsync -a --delete \
    --exclude node_modules --exclude .next --exclude .next.backup --exclude .next.staging \
    --exclude .env --exclude '.env.*' --exclude data \
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

VER="$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)"
echo "=== Done. Panel should be on v${VER} ==="

if [ -x scripts/wait-panel-ready.sh ]; then
  bash scripts/wait-panel-ready.sh || true
fi

echo "Health:"
curl -sS -m 8 http://127.0.0.1:13000/api/health || curl -sS -m 8 http://127.0.0.1/api/health || true
echo
echo "Remote-update: vendor Admin → Remote Panel Update, force re-sync, URL http://THIS_IP (not https)"
echo "If this host is 45.88.138.18, confirm /api/panel/version is no longer 1.9.45"
