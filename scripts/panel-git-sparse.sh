#!/usr/bin/env bash
# Keep IPTV panel git checkouts free of the marketing site and editor-only trees.
# Marketing stays on GitHub (nexlify.live); fleet panels never materialize it.
set -euo pipefail
ROOT="$(cd "${1:-.}" && pwd)"
cd "$ROOT"
[ -d .git ] || exit 0

git sparse-checkout init --no-cone >/dev/null 2>&1 || true
cat > .git/info/sparse-checkout <<'EOF'
/*
!/marketing-drop-in/
!/windows/
!/.claude/
!/.cursor/
!/.agents/
!/graft/
EOF
if git sparse-checkout reapply >/dev/null 2>&1; then
  echo "[panel-git-sparse] sparse checkout applied (no marketing-drop-in)"
else
  git read-tree -mu HEAD >/dev/null 2>&1 || true
  echo "[panel-git-sparse] sparse-checkout written"
fi
