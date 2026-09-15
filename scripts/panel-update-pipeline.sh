#!/usr/bin/env bash
# Node-separated panel update. Live IPTV UI stays on current .next until apply.
#
#   bash scripts/panel-update-pipeline.sh build    # node 3: compile → .next.staging
#   bash scripts/panel-update-pipeline.sh verify   # node 2: staging must be a valid Next build
#   bash scripts/panel-update-pipeline.sh apply    # node 1: backup → swap → restart → health/rollback
#
# Never: git reset, npx next, build into live .next, stop nexlify before a valid staging build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STEP="${1:-}"
# shellcheck source=scripts/panel-node-guard.sh
. "$ROOT/scripts/panel-node-guard.sh"

health_ok() {
  curl -sS -m 10 http://127.0.0.1:13000/api/health 2>/dev/null | grep -q '"app":"ok"'
}

cmd_build() {
  echo "=== pipeline build (node 3 / staging only) ==="
  export NEXLIFY_SKIP_GIT_RESET=1
  # Staging does not write live .next or stop PM2 — safe while viewers are connected.
  export NEXLIFY_FORCE_BUILD=1
  export NEXLIFY_DIST_DIR=".next.staging"
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"
  unset NEXT_PRIVATE_WORKER_THREADS 2>/dev/null || true
  # Do not call apply-panel-fast-update.sh here — it bootstraps scripts from
  # CDN and can overwrite recover/watchdog on node 1.
  if [ ! -x ./node_modules/.bin/next ] && [ ! -f ./node_modules/next/dist/bin/next ]; then
    echo "ERROR: local Next binary missing" >&2
    return 1
  fi
  rm -rf .next.staging
  echo "Compiling into .next.staging (live .next stays online) ..."
  node ./node_modules/next/dist/bin/next build
  # Standalone PM2 cwd is .next/standalone — CSS/JS must be copied in or /_next/static 404s.
  if [ -x "$ROOT/scripts/prepare-standalone.sh" ]; then
    bash "$ROOT/scripts/prepare-standalone.sh"
  fi
  echo "Staging compile finished — live .next not touched"
  cmd_verify
}

cmd_verify() {
  echo "=== pipeline verify (node 2) ==="
  if ! bash "$ROOT/scripts/has-valid-next-build.sh" ".next.staging"; then
    echo "ERROR: .next.staging is not a valid production build" >&2
    return 1
  fi
  local css
  css="$(find .next.staging/static/css -name '*.css' 2>/dev/null | wc -l | tr -d ' ')"
  if [ -z "$css" ] || [ "$css" -lt 1 ]; then
    echo "ERROR: staging build has no CSS" >&2
    return 1
  fi
  echo "VERIFY_OK BUILD_ID=$(cat .next.staging/BUILD_ID) css=$css"
  if health_ok; then
    echo "LIVE_HEALTH=ok (unchanged during verify)"
  else
    echo "WARN: live health not ok — apply will refuse unless NEXLIFY_FORCE_APPLY=1"
  fi
}

rollback_live() {
  echo "APPLY: health failed — restoring .next.backup"
  if [ -f .next.backup/BUILD_ID ] || [ -f .next.backup/standalone/server.js ]; then
    rm -rf .next.failed
    [ -d .next ] && mv .next .next.failed
    cp -a .next.backup .next
    bash "$ROOT/scripts/panel-restart-safe.sh" --nexlify-only || bash "$ROOT/scripts/pm2-start.sh" || true
  fi
}

cmd_apply() {
  echo "=== pipeline apply (node 1) ==="
  cmd_verify
  if ! health_ok && [ "${NEXLIFY_FORCE_APPLY:-}" != "1" ]; then
    echo "ERROR: live panel is not healthy — refusing swap" >&2
    return 1
  fi
  if [ -x "$ROOT/scripts/snapshot-next-backup.sh" ]; then
    bash "$ROOT/scripts/snapshot-next-backup.sh"
  fi
  echo "Swapping .next.staging → .next"
  rm -rf .next.old
  mv .next .next.old
  mv .next.staging .next
  unset NEXLIFY_DIST_DIR || true
  export NEXLIFY_DIST_DIR=".next"
  if [ -x "$ROOT/scripts/fix-next-distdir-references.sh" ]; then
    bash "$ROOT/scripts/fix-next-distdir-references.sh" .next 2>/dev/null || true
  fi
  bash "$ROOT/scripts/panel-restart-safe.sh" --nexlify-only || bash "$ROOT/scripts/pm2-start.sh"
  sleep 3
  if health_ok; then
    echo "APPLY_OK LIVE=$(cat .next/BUILD_ID 2>/dev/null || echo unknown)"
    curl -sS -m 8 http://127.0.0.1:13000/api/health || true
    echo
    if [ -x "$ROOT/scripts/snapshot-next-backup.sh" ]; then
      bash "$ROOT/scripts/snapshot-next-backup.sh" || true
    fi
    return 0
  fi
  rollback_live
  echo "ERROR: apply rolled back to backup" >&2
  return 1
}

case "$STEP" in
  build) cmd_build ;;
  verify) cmd_verify ;;
  apply) cmd_apply ;;
  *)
    echo "Usage: $0 build|verify|apply" >&2
    exit 2
    ;;
esac
