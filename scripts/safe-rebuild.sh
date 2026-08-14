#!/bin/bash
# Nexlify Panel — Safe rebuild script
# Prevents build failures from missing dependencies after rsync or code sync
#
# Usage: bash scripts/safe-rebuild.sh [--skip-prisma] [--skip-build] [--skip-restart]
#
# What it does:
# 1. Checks node_modules integrity (reinstalls if missing tailwindcss etc)
# 2. Runs prisma generate
# 3. Runs npm run build
# 4. Restarts PM2 processes
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/home/nexlify}"
SKIP_PRISMA=0
SKIP_BUILD=0
SKIP_RESTART=0

for arg in "$@"; do
  case "$arg" in
    --skip-prisma) SKIP_PRISMA=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-restart) SKIP_RESTART=1 ;;
  esac
done

cd "$PANEL_DIR"

echo "=== Step 1: Check node_modules ==="
MISSING=0
for dep in tailwindcss next react prisma; do
  if [ ! -d "node_modules/$dep" ]; then
    echo "  MISSING: $dep"
    MISSING=1
  fi
done

if [ "$MISSING" -eq 1 ]; then
  echo "  Installing missing dependencies..."
  npm install 2>&1 | tail -5
else
  echo "  All critical dependencies present"
fi

echo ""
echo "=== Step 2: Prisma generate ==="
if [ "$SKIP_PRISMA" -eq 0 ]; then
  npx prisma generate 2>&1 | tail -3
  echo "  Prisma client generated"
else
  echo "  Skipped"
fi

echo ""
echo "=== Step 3: Build ==="
if [ "$SKIP_BUILD" -eq 0 ]; then
  npm run build 2>&1 | tail -10
  if [ ! -f ".next/BUILD_ID" ]; then
    echo "  ERROR: Build failed — no BUILD_ID"
    exit 1
  fi
  echo "  Build succeeded: $(cat .next/BUILD_ID)"
else
  echo "  Skipped"
fi

echo ""
echo "=== Step 4: Restart ==="
if [ "$SKIP_RESTART" -eq 0 ]; then
  pm2 restart nexlify --update-env 2>&1 | grep -E 'status|name' | head -5
  sleep 3
  pm2 logs nexlify --lines 3 --nostream 2>&1 | grep -E 'Ready|error' | tail -3
  pm2 save 2>&1 | tail -1
  echo "  Restarted and saved"
else
  echo "  Skipped"
fi

echo ""
echo "=== Done ==="
