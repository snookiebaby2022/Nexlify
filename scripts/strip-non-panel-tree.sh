#!/usr/bin/env bash
# Remove leftover marketing / editor / old build trees from a panel install.
# Safe to run on a live VPS — does not touch .env, backups/, .next (live), or node_modules.
set -euo pipefail
ROOT="$(cd "${1:-.}" && pwd)"
cd "$ROOT"

rm -rf \
  marketing-drop-in \
  windows \
  .claude \
  .cursor \
  .agents \
  graft \
  .next.test \
  .next.old \
  .next.backup \
  .next.zip \
  dist \
  2>/dev/null || true

# Stale staging leftovers from failed builds (not the live .next)
rm -rf .next.staging 2>/dev/null || true

echo "[strip-non-panel] removed marketing and leftover trees under $ROOT"
