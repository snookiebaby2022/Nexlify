#!/usr/bin/env bash
# Rewrite accidental .next.staging path references inside a built .next tree
# so runtime always uses .next after staging swap.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$ROOT/.next}"

if [ ! -d "$TARGET" ]; then
  echo "fix-next-distdir: skip (no $TARGET)"
  exit 0
fi

# Only touch JS/JSON text under the build — avoid binary assets
count=0
while IFS= read -r -d '' f; do
  if grep -q '\.next\.staging' "$f" 2>/dev/null; then
    sed -i 's|\.next\.staging|.next|g' "$f"
    count=$((count + 1))
  fi
done < <(find "$TARGET" -type f \( -name '*.js' -o -name '*.json' -o -name '*.mjs' -o -name '*.cjs' \) -print0 2>/dev/null)

echo "fix-next-distdir: cleaned $count file(s) under $TARGET"
