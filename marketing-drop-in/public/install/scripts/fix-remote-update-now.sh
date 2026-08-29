#!/usr/bin/env bash
# Repair a customer panel so remote-update works: clear stuck in-panel updates,
# restart Postgres if needed, sync origin/main from GitHub, and rebuild.
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

clear_stuck_in_panel_update() {
  echo "==> Clearing stuck in-panel update (git pull / progress banner)"
  # Kill hung background update workers and stuck git fetch/pull
  if [ -f .update-progress.pid ]; then
    pid="$(tr -d ' \n' < .update-progress.pid 2>/dev/null || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Killing update worker pid $pid"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 1
      kill -KILL "$pid" 2>/dev/null || true
    fi
  fi
  pkill -f 'panel-update-background' 2>/dev/null || true
  pkill -f 'scripts/panel-update' 2>/dev/null || true
  # Only kill git if it looks like an update fetch — best-effort
  pkill -f "git fetch origin" 2>/dev/null || true
  pkill -f "git.*origin/main" 2>/dev/null || true
  rm -f .update-progress.pid .update-in-progress
  rm -f .update-progress.json .update-progress.pid .update-in-progress
  echo "Removed stuck .update-progress.json (if any)"
  rm -f .git/index.lock .git/HEAD.lock 2>/dev/null || true
}

ROOT="$(find_panel)" || {
  echo "ERROR: could not find panel install" >&2
  exit 1
}

echo "=== Nexlify remote-update repair ==="
echo "Dir: $ROOT"
cd "$ROOT"

clear_stuck_in_panel_update
restart_postgres

export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=echo
export GCM_INTERACTIVE=never
export GIT_HTTP_LOW_SPEED_LIMIT="${GIT_HTTP_LOW_SPEED_LIMIT:-1000}"
export GIT_HTTP_LOW_SPEED_TIME="${GIT_HTTP_LOW_SPEED_TIME:-45}"

if [ -f "$ROOT/scripts/vps-git-auth.sh" ]; then
  # shellcheck source=scripts/vps-git-auth.sh
  . "$ROOT/scripts/vps-git-auth.sh"
  configure_nexlify_git_origin "$ROOT"
  ensure_nexlify_git_ssh
fi

if [ -d .git ]; then
  echo "==> git fetch origin main (90s timeout)"
  if command -v timeout >/dev/null 2>&1; then
    timeout 90 git fetch origin main || {
      echo "WARN: git fetch timed out or failed — retrying with resolved remote"
      configure_nexlify_git_origin "$ROOT"
      timeout 90 git fetch origin main
    }
  else
    git fetch origin main
  fi
  git reset --hard origin/main
  chmod +x scripts/*.sh 2>/dev/null || true
else
  echo "WARN: not a git checkout — cloning into staging then swapping (keeps .env + data + .git)"
  TMP="$(mktemp -d)"
  CLONE_URL="https://github.com/snookiebaby2022/Nexlify.git"
  if [ -f "$ROOT/scripts/vps-git-auth.sh" ]; then
    CLONE_URL="$(resolve_nexlify_git_url)"
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout 180 git clone --depth 1 --branch main "$CLONE_URL" "$TMP/nexlify"
  else
    git clone --depth 1 --branch main "$CLONE_URL" "$TMP/nexlify"
  fi
  rsync -a --delete \
    --exclude node_modules --exclude .next --exclude .next.backup --exclude .next.staging \
    --exclude .env --exclude '.env.*' --exclude data \
    "$TMP/nexlify/" "$ROOT/"
  rm -rf "$TMP"
  chmod +x scripts/*.sh 2>/dev/null || true
fi

if [ -f scripts/deploy-vps.sh ]; then
  bash scripts/deploy-vps.sh panel
else
  npm install --include=dev --no-audit --no-fund
  npx prisma generate || true
  npx prisma migrate deploy || npx prisma db push --accept-data-loss || true
  npm run build
  bash scripts/pm2-start.sh || pm2 restart nexlify --update-env
fi

# Clear progress after successful repair so UI does not keep "Updating…"
rm -f .update-progress.pid .update-in-progress
rm -f .update-progress.json 2>/dev/null || true

VER="$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)"
echo "=== Done. Panel should be on v${VER} ==="

if [ -f scripts/wait-panel-ready.sh ]; then
  bash scripts/wait-panel-ready.sh || true
fi

echo "Health:"
for i in 1 2 3 4 5 6; do
  if curl -sS -m 8 http://127.0.0.1:13000/api/health 2>/dev/null | grep -q '"app":"ok"'; then
    curl -sS -m 8 http://127.0.0.1:13000/api/health || true
    echo
    break
  fi
  if curl -sS -m 8 http://127.0.0.1/api/health 2>/dev/null | grep -q '"app":"ok"'; then
    curl -sS -m 8 http://127.0.0.1/api/health || true
    echo
    break
  fi
  sleep 5
done
echo
echo "Remote-update: vendor Admin → Remote Panel Update, force re-sync, URL http://THIS_IP (not https)"
echo "If this host is 45.88.138.18, confirm package version is current after repair"
