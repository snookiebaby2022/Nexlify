#!/usr/bin/env bash
# Update worker launcher — always runs from the real panel install root, never .next/standalone.
# Spawned by Admin → Settings → Updates (startBackgroundPanelUpdate).
set -euo pipefail

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

ERR_LOG="${ROOT}/.update-worker-err.log"
TS_SCRIPT="${ROOT}/scripts/panel-update-background.ts"

run_tsx() {
  if command -v npx >/dev/null 2>&1 && npx tsx --version >/dev/null 2>&1; then
    exec npx tsx "$TS_SCRIPT" 2>>"$ERR_LOG"
  fi
  if command -v npx >/dev/null 2>&1; then
    exec npx --yes tsx "$TS_SCRIPT" 2>>"$ERR_LOG"
  fi
  if node --import tsx "$TS_SCRIPT" 2>>"$ERR_LOG"; then
    exit 0
  fi
  echo "panel-update-background.sh: tsx not available — run: npm install -g tsx" >&2
  exit 127
}

run_tsx
