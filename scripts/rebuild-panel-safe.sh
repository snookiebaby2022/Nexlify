#!/usr/bin/env bash
# Safe panel rebuild — never builds into a live .next tree (avoids ENOENT
# build-manifest / apple-icon collect failures while PM2 is running).
#
#   cd /opt/nexlify-panel && bash scripts/rebuild-panel-safe.sh
#   curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/rebuild-panel-safe.sh' | sudo bash
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
    if [ -f "$d/package.json" ]; then
      echo "$d"
      return 0
    fi
  done
  return 1
}

ROOT="$(find_panel)" || {
  echo "ERROR: panel not found" >&2
  exit 1
}
cd "$ROOT"
if command -v flock >/dev/null 2>&1; then
  exec 9>/tmp/nexlify-rebuild.lock
  if ! flock -n 9; then
    echo "ERROR: another rebuild-panel-safe.sh is already running — not starting a second copy" >&2
    exit 1
  fi
fi
echo "=== Safe rebuild at $ROOT ==="

if [ -f "$ROOT/scripts/nexlify-migrate-guard.sh" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/scripts/nexlify-migrate-guard.sh"
  if ! nexlify_refuse_restart_if_migrating; then
    exit 1
  fi
fi

# Do not recycle the panel while a large SQL import is in progress
if [ -f /tmp/nexlify-migrate-in-progress ]; then
  age=$(( $(date +%s) - $(stat -c %Y /tmp/nexlify-migrate-in-progress 2>/dev/null || echo 0) ))
  if [ "$age" -lt 7200 ]; then
    echo "ERROR: SQL migration import in progress (/tmp/nexlify-migrate-in-progress, ${age}s old)." >&2
    echo "Wait for the import to finish (or remove the lock if it is stale) before rebuilding." >&2
    exit 1
  fi
  rm -f /tmp/nexlify-migrate-in-progress
fi

pkill -f 'panel-update-background' 2>/dev/null || true
pkill -f 'next build' 2>/dev/null || true
rm -f .update-progress.pid .update-in-progress .update-progress.json
rm -rf .next.staging

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
unset NEXT_PRIVATE_WORKER_THREADS 2>/dev/null || true
export GIT_TERMINAL_PROMPT=0

if [ -d .git ]; then
  echo "==> git fetch + reset --hard origin/main"
  if [ -f "$ROOT/scripts/vps-git-auth.sh" ]; then
    # shellcheck source=scripts/vps-git-auth.sh
    . "$ROOT/scripts/vps-git-auth.sh"
    [ -f "$ROOT/scripts/ensure-fleet-deploy-key.sh" ] && bash "$ROOT/scripts/ensure-fleet-deploy-key.sh" || true
    configure_nexlify_git_origin "$ROOT"
    ensure_nexlify_git_ssh
  fi
  timeout 90 git fetch origin main || git fetch origin main
  bash "$ROOT/scripts/panel-git-sparse.sh" "$ROOT" || true
  git reset --hard origin/main
  bash "$ROOT/scripts/strip-non-panel-tree.sh" "$ROOT" || true
  chmod +x scripts/*.sh 2>/dev/null || true
fi

echo "==> deps + prisma"
npm install --include=dev --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
if [ -x scripts/verify-db-schema.sh ]; then
  bash scripts/verify-db-schema.sh
else
  node scripts/audit-db-schema.cjs
fi

echo "==> staging build + swap"
if [ -x scripts/apply-panel-fast-update.sh ]; then
  bash scripts/apply-panel-fast-update.sh build-prep
  bash scripts/apply-panel-fast-update.sh build-compile
  bash scripts/apply-panel-fast-update.sh swap
else
  # Fallback: build to staging via env
  export NEXLIFY_DIST_DIR=.next.staging
  rm -rf .next.staging
  node ./node_modules/next/dist/bin/next build
  bash scripts/prepare-standalone.sh 2>/dev/null || true
  rm -rf .next.old
  [ -d .next ] && mv .next .next.old
  mv .next.staging .next
  export NEXLIFY_DIST_DIR=.next
  bash scripts/fix-next-distdir-references.sh .next 2>/dev/null || true
  bash scripts/prepare-standalone.sh 2>/dev/null || true
  rm -rf .next.old
fi

echo "==> restart"
bash scripts/pm2-start.sh || bash scripts/panel-restart-safe.sh --nexlify-only || pm2 restart nexlify --update-env

VER="$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)"
echo "=== Done v${VER} ==="
for i in 1 2 3 4 5 6; do
  if curl -sS -m 8 http://127.0.0.1:13000/api/health 2>/dev/null | grep -q '"app":"ok"'; then
    curl -sS -m 8 http://127.0.0.1:13000/api/health || true
    echo
    exit 0
  fi
  if curl -sS -m 8 http://127.0.0.1/api/health 2>/dev/null | grep -q '"app":"ok"'; then
    curl -sS -m 8 http://127.0.0.1/api/health || true
    echo
    exit 0
  fi
  sleep 4
done
echo "WARN: health not ready yet — check: pm2 logs nexlify"
exit 0
