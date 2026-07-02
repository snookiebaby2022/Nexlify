#!/bin/sh
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
for f in "$root"/scripts/*.sh; do
  [ -f "$f" ] || continue
  sed -i 's/\r$//' "$f" 2>/dev/null || sed -i '' 's/\r$//' "$f"
done
chmod +x "$root"/scripts/*.sh 2>/dev/null || true
echo "LF line endings applied to scripts/*.sh"
