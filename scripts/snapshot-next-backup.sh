#!/usr/bin/env bash
# Keep a known-good .next.backup so recover can roll back without a source rebuild.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! bash "$ROOT/scripts/has-valid-next-build.sh" 2>/dev/null; then
  echo "snapshot-next-backup: no valid .next — skip"
  exit 0
fi

cur="$(cat .next/BUILD_ID 2>/dev/null || true)"
old="$(cat .next.backup/BUILD_ID 2>/dev/null || true)"
if [ -n "$cur" ] && [ "$cur" = "$old" ]; then
  echo "snapshot-next-backup: already have $cur"
  exit 0
fi

echo "snapshot-next-backup: copying .next → .next.backup ($cur)"
rm -rf .next.backup.tmp
cp -a .next .next.backup.tmp
rm -rf .next.backup
mv .next.backup.tmp .next.backup
echo "snapshot-next-backup: OK"
