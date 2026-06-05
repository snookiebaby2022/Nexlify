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
if [ ! -d .next ]; then
  echo "Missing .next — run: ./scripts/deploy-vps.sh"
  exit 1
fi
./scripts/pm2-start.sh
echo "OK — https://panel.nexlify.live should work."
