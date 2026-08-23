#!/usr/bin/env bash
# Remove build artifacts and generated files from local clone (safe — respects .gitignore).
# Run from repo root: bash scripts/nexlify-local-cleanup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Nexlify local cleanup ==="

# Build outputs
rm -rf .next .next.old .next.backup .next.staging marketing-drop-in/.next dist marketing-drop-in/dist test-results 2>/dev/null || true
rm -f build-out.txt lint-out.txt tsconfig.tsbuildinfo marketing-drop-in/tsconfig.tsbuildinfo 2>/dev/null || true
rm -f scripts/.panel-releases-website-snippet.ts 2>/dev/null || true
rm -f ./*.log marketing-*.log release-*.log sync-*.log deploy-*.log 2>/dev/null || true

# Regenerate gitignored deploy bundle locally (optional)
if [ -f marketing-drop-in/scripts/generate-vps-bundle.sh ]; then
  bash marketing-drop-in/scripts/generate-vps-bundle.sh
  echo "Regenerated marketing-drop-in/scripts/vps-full-update.sh (gitignored upload artifact)"
fi

echo ""
echo "To remove ignored files (node_modules, .env, etc.): git clean -fdX"
echo "Local cleanup done. Run: bash scripts/nexlify-sync-all.sh"
