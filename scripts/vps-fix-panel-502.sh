#!/usr/bin/env bash
# One-shot 502 repair — delegates to permanent panel/nginx scripts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
chmod +x scripts/*.sh 2>/dev/null || true

if [ -f scripts/vps-fix-both-sites.sh ] && [ "$(id -u)" = 0 ]; then
  echo "=== Full panel + nginx repair (root) ==="
  bash scripts/vps-fix-both-sites.sh
  exit 0
fi

echo "=== Panel 502 fix ($ROOT) ==="
if ! bash scripts/has-valid-next-build.sh 2>/dev/null; then
  echo "Missing or stale .next — running npm run build..."
  rm -rf .next
  npm run build
fi
bash scripts/prepare-standalone.sh
./scripts/pm2-start.sh
echo "OK — https://panel.nexlify.live should work."
