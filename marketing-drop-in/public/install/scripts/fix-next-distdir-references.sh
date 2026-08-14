#!/usr/bin/env bash
# After a staging build (NEXLIFY_DIST_DIR=.next.staging), Next bakes
# distDir: "./.next.staging" into standalone/server.js and may nest the
# server tree at standalone/.next.staging/. prepare-standalone copies
# static into standalone/.next/, so runtime looks for pages under one
# tree and CSS/JS under another → /_next/static 404s → client-side crash.
#
# This script rewrites refs to .next and merges any nested .next.staging
# directory into standalone/.next so production always uses ./.next.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$ROOT/.next}"

if [ ! -d "$TARGET" ]; then
  echo "fix-next-distdir: skip (no $TARGET)"
  exit 0
fi

STANDALONE="$TARGET/standalone"

# Merge Next's nested staging tree into the canonical standalone/.next
if [ -d "$STANDALONE/.next.staging" ]; then
  mkdir -p "$STANDALONE/.next"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$STANDALONE/.next.staging/" "$STANDALONE/.next/"
  else
    cp -a "$STANDALONE/.next.staging/." "$STANDALONE/.next/"
  fi
  rm -rf "$STANDALONE/.next.staging"
  echo "fix-next-distdir: merged standalone/.next.staging → standalone/.next"
fi

# Also fix a top-level nested name if someone copied the whole dist oddly
if [ -d "$TARGET/.next.staging" ] && [ "$TARGET" != "$ROOT" ]; then
  mkdir -p "$TARGET/.next"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$TARGET/.next.staging/" "$TARGET/.next/"
  else
    cp -a "$TARGET/.next.staging/." "$TARGET/.next/"
  fi
  rm -rf "$TARGET/.next.staging"
  echo "fix-next-distdir: merged $TARGET/.next.staging → $TARGET/.next"
fi

# Only touch JS/JSON text under the build — avoid binary assets
count=0
while IFS= read -r -d '' f; do
  if grep -q '\.next\.staging' "$f" 2>/dev/null; then
    sed -i 's|\.next\.staging|.next|g' "$f"
    count=$((count + 1))
  fi
done < <(find "$TARGET" -type f \( -name '*.js' -o -name '*.json' -o -name '*.mjs' -o -name '*.cjs' \) -print0 2>/dev/null)

# Force standalone server.js distDir (baked nextConfig) to ./.next
if [ -f "$STANDALONE/server.js" ]; then
  if grep -q 'distDir' "$STANDALONE/server.js" 2>/dev/null; then
    sed -i 's|"distDir":"\./\.next[^"]*"|"distDir":"./.next"|g' "$STANDALONE/server.js"
    sed -i 's|"distDir":"\.next[^"]*"|"distDir":"./.next"|g' "$STANDALONE/server.js"
  fi
fi

# Force required-server-files.json config.distDir
while IFS= read -r -d '' rsf; do
  python3 - "$rsf" <<'PY' 2>/dev/null || true
import json, sys
path = sys.argv[1]
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    raise SystemExit(0)
cfg = data.setdefault("config", {})
if cfg.get("distDir") != ".next":
    cfg["distDir"] = ".next"
    with open(path, "w") as f:
        json.dump(data, f)
print("fix-next-distdir: distDir=.next in", path)
PY
done < <(find "$TARGET" -type f -name 'required-server-files.json' -print0 2>/dev/null)

# Sanity: leftover nested staging dir should be gone
if [ -d "$STANDALONE/.next.staging" ]; then
  echo "fix-next-distdir: ERROR standalone/.next.staging still present" >&2
  exit 1
fi

if [ -f "$STANDALONE/server.js" ] && grep -q '\.next\.staging' "$STANDALONE/server.js" 2>/dev/null; then
  echo "fix-next-distdir: ERROR server.js still references .next.staging" >&2
  exit 1
fi

echo "fix-next-distdir: cleaned $count file(s) under $TARGET"
