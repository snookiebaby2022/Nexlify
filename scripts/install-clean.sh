#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Checking package.json..."
node scripts/check-package.mjs

echo "==> Removing old install artifacts..."
rm -rf node_modules package-lock.json

echo "==> Installing (do NOT use npm audit fix --force)..."
npm install

echo "==> Done. Installed next:"
npm ls next --depth=0
