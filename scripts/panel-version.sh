#!/usr/bin/env bash
# Panel version slug for cache-bust (e.g. 1.9.3 → 193). Used by installer/update scripts.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/package.json" ] && command -v node >/dev/null 2>&1; then
  node -p "require('$ROOT/package.json').version.replace(/\\./g,'')" 2>/dev/null || echo "0"
else
  echo "0"
fi
