#!/usr/bin/env bash
# Bootstrap: pull latest then run fix-all (use when fix-all.sh not on VPS yet).
# Usage: cd /home/nexlify-panel && git fetch origin main && git reset --hard origin/main && bash scripts/nexlify-vps-bootstrap.sh

set -euo pipefail
PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify}"

if [ ! -d "$PANEL/.git" ]; then
  echo "ERROR: $PANEL is not a git repo."
  exit 1
fi

cd "$PANEL"
git fetch origin main
git reset --hard origin/main

exec bash scripts/nexlify-fix-all.sh
