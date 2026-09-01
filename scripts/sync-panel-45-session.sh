#!/usr/bin/env bash
# Sync session panel files to server 45 and rebuild.
#
# Includes only panel app paths from scripts/panel-45-sync-files.txt.
# Does NOT sync: iptv-edge-proxy, edge fleet scripts, load-test scripts, _tmp-*, docs, tests.
#
# From your dev machine (WSL / Git Bash / Linux):
#   bash scripts/sync-panel-45-session.sh
#
# From server 45 after WinSCP copy (files already in /opt/nexlify-panel):
#   cd /opt/nexlify-panel && bash scripts/sync-panel-45-session.sh --rebuild-only
#
# Env:
#   PANEL_45_HOST   default root@45.88.138.18
#   PANEL_45_DIR    default /opt/nexlify-panel
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$SCRIPT_DIR/panel-45-sync-files.txt"
REMOTE="${PANEL_45_HOST:-root@45.88.138.18}"
REMOTE_DIR="${PANEL_45_DIR:-/opt/nexlify-panel}"

filter_manifest() {
  grep -v '^\s*#' "$MANIFEST" | grep -v '^\s*$' || true
}

rebuild_on_remote() {
  ssh "$REMOTE" "cd '$REMOTE_DIR' && export NEXLIFY_ALLOW_PROTECTED_45=1 NEXLIFY_SKIP_GIT=1 && bash scripts/rebuild-panel-safe.sh"
}

rebuild_local() {
  cd "$REMOTE_DIR"
  export NEXLIFY_ALLOW_PROTECTED_45=1
  export NEXLIFY_SKIP_GIT=1
  bash scripts/rebuild-panel-safe.sh
}

if [ "${1:-}" = "--rebuild-only" ]; then
  echo "=== Rebuild only at $REMOTE_DIR ==="
  if [ -f /etc/nexlify/server-45-protected ] || hostname -I 2>/dev/null | tr ' ' '\n' | grep -qx '45.88.138.18'; then
    rebuild_local
  else
    rebuild_on_remote
  fi
  echo "=== Done ==="
  exit 0
fi

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: missing $MANIFEST" >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "ERROR: rsync required. Copy files from panel-45-sync-files.txt via WinSCP, then on 45 run:" >&2
  echo "  cd /opt/nexlify-panel && bash scripts/sync-panel-45-session.sh --rebuild-only" >&2
  exit 1
fi

TMP_LIST="$(mktemp)"
filter_manifest >"$TMP_LIST"
COUNT="$(wc -l <"$TMP_LIST" | tr -d ' ')"
echo "=== Syncing $COUNT files to $REMOTE:$REMOTE_DIR ==="

rsync -avz \
  --files-from="$TMP_LIST" \
  "$ROOT/" \
  "$REMOTE:$REMOTE_DIR/"

rm -f "$TMP_LIST"

echo "=== Rebuilding panel on 45 ==="
rebuild_on_remote

echo "=== Sync + rebuild complete ==="
