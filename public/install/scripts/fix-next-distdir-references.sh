#!/usr/bin/env bash
# Next.js embeds distDir (e.g. ".next.staging") in compiled route modules during staging builds.
# After swapping staging → .next, rewrite those references or runtime breaks (dashboard stats, etc.).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DIST="${1:-.next}"
TARGET="$ROOT/$DIST"

if [ ! -d "$TARGET" ]; then
  echo "fix-next-distdir: skip — $DIST not found"
  exit 0
fi

fixed=0
while IFS= read -r -d '' f; do
  if grep -q '\.next\.staging' "$f" 2>/dev/null; then
    sed -i 's/\.next\.staging/.next/g' "$f"
    fixed=$((fixed + 1))
  fi
done < <(find "$TARGET" -type f \( -name '*.js' -o -name '*.json' \) -print0 2>/dev/null)

if [ "$fixed" -gt 0 ]; then
  echo "fix-next-distdir: normalized .next.staging → .next in $fixed file(s) under $DIST"
else
  echo "fix-next-distdir: OK (no .next.staging references in $DIST)"
fi
