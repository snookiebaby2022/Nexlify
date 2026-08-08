#!/usr/bin/env bash
# Panel semver for cache-bust URLs (e.g. 1.9.7 → v1.9.7 on installer + tarball).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/package.json" ] && command -v node >/dev/null 2>&1; then
  node -p "require('$ROOT/package.json').version" 2>/dev/null || echo "0.0.0"
else
  echo "0.0.0"
fi
