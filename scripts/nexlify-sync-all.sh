#!/usr/bin/env bash
# Keep GitHub, local clone, and VPS deploy artifacts in sync.
# Run from repo root after git pull: bash scripts/nexlify-sync-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Nexlify repo sync ==="

echo "-> Panel releases → marketing"
cp -f src/lib/panel-releases.json marketing-drop-in/src/lib/panel-releases.json
npm run releases:sync 2>/dev/null || node scripts/sync-releases-to-website.mjs

echo "-> Installer scripts → marketing public/install"
bash scripts/sync-install-to-marketing.sh

echo "-> Shell script line endings"
node scripts/fix-sh-lf.mjs 2>/dev/null || true

echo "-> VPS deploy bundle (upload artifact — not committed to git)"
bash marketing-drop-in/scripts/generate-vps-bundle.sh

echo ""
echo "=== Sync complete ==="
echo "Git: commit source changes (not vps-full-update.sh or dist/*.tar.gz)"
echo "VPS marketing: upload marketing-drop-in/scripts/vps-full-update.sh → /root/"
echo "VPS panel tarball: bash scripts/publish-panel-release.sh (on vendor VPS)"
