#!/usr/bin/env bash
# Update worker launcher — always runs from the real panel install root, never .next/standalone.
# Spawned by Admin → Settings → Updates (startBackgroundPanelUpdate).
set -euo pipefail

# Avoid "cannot change locale (en_US.UTF-8)" when that locale is not generated.
if [ "${LC_ALL:-}" = "en_US.UTF-8" ] || [ "${LANG:-}" = "en_US.UTF-8" ]; then
  export LANG=C.UTF-8
  export LC_ALL=C.UTF-8
else
  export LANG="${LANG:-C.UTF-8}"
  export LC_ALL="${LC_ALL:-C.UTF-8}"
fi

find_panel_root() {
  local dir="$1"
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    if [ -f "$dir/package.json" ] \
      && [ -f "$dir/scripts/panel-update-background.ts" ] \
      && [ -f "$dir/src/lib/panel-server.ts" ]; then
      echo "$dir"
      return 0
    fi
    if [[ "$dir" == *"/.next/standalone" ]]; then
      dir="$(cd "$dir/../../.." && pwd)"
      continue
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT=""

if [ -n "${PANEL_REPO_PATH:-}" ] && [ -f "${PANEL_REPO_PATH}/src/lib/panel-server.ts" ]; then
  ROOT="$(cd "${PANEL_REPO_PATH}" && pwd)"
elif ROOT="$(find_panel_root "$SCRIPT_DIR")"; then
  :
elif ROOT="$(find_panel_root "$(pwd)")"; then
  :
else
  for candidate in /home/nexlify /home/nexlify-panel /opt/nexlify-panel; do
    if [ -f "$candidate/src/lib/panel-server.ts" ]; then
      ROOT="$candidate"
      break
    fi
  done
fi

if [ -z "$ROOT" ] || [ ! -f "$ROOT/scripts/panel-update-background.ts" ]; then
  echo "panel-update-background.sh: could not find panel install root (started from $SCRIPT_DIR)" >&2
  exit 127
fi

cd "$ROOT"
export PANEL_REPO_PATH="$ROOT"
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${ROOT}/node_modules/.bin:${PATH:-}"
ERR_LOG="${ROOT}/.update-worker-err.log"

if [ -f "${ROOT}/scripts/vps-git-auth.sh" ]; then
  # shellcheck source=scripts/vps-git-auth.sh
  . "${ROOT}/scripts/vps-git-auth.sh"
  if [ -f "${ROOT}/scripts/ensure-fleet-deploy-key.sh" ]; then
    bash "${ROOT}/scripts/ensure-fleet-deploy-key.sh" >>"$ERR_LOG" 2>&1 || true
  fi
  configure_nexlify_git_origin "$ROOT"
  ensure_nexlify_git_ssh
fi

TS_SCRIPT="${ROOT}/scripts/panel-update-background.ts"

if [ ! -f "${ROOT}/node_modules/tsx/dist/cli.mjs" ] && [ -f "${ROOT}/scripts/ensure-tsx.sh" ]; then
  bash "${ROOT}/scripts/ensure-tsx.sh" >>"$ERR_LOG" 2>&1 || true
fi

run_tsx() {
  local tsx_bin="${ROOT}/node_modules/.bin/tsx"
  local tsx_cli="${ROOT}/node_modules/tsx/dist/cli.mjs"
  if [ -x "$tsx_bin" ]; then
    exec "$tsx_bin" "$TS_SCRIPT" 2>>"$ERR_LOG"
  fi
  if [ -f "$tsx_cli" ]; then
    exec node "$tsx_cli" "$TS_SCRIPT" 2>>"$ERR_LOG"
  fi
  if command -v tsx >/dev/null 2>&1; then
    exec tsx "$TS_SCRIPT" 2>>"$ERR_LOG"
  fi
  if command -v npx >/dev/null 2>&1; then
    exec npx --yes tsx "$TS_SCRIPT" 2>>"$ERR_LOG"
  fi
  echo "panel-update-background.sh: tsx not available — run: cd $ROOT && bash scripts/ensure-tsx.sh" >&2
  exit 127
}

run_tsx
