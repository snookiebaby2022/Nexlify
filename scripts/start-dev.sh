#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node.js 20 LTS: https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "==> Installing dependencies..."
  npm install
fi

echo "==> Starting Nexlify at http://localhost:3000"
exec npm run dev
