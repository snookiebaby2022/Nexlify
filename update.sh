#!/bin/bash
# Permanent update script for Nexlify panel on 75.119.137.174
# Run this to update to the latest version from GitHub
set -e
cd /opt/nexlify-panel

echo "=== Nexlify Panel Update ==="
echo "Current version: $(grep '"version"' package.json | head -1)"

echo "=== Pulling latest code ==="
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "Already up to date."
  exit 0
fi
git pull origin main

echo "=== Installing dependencies ==="
npm install --no-audit --no-fund --loglevel=error

echo "=== Running prisma generate + db push ==="
npx prisma generate
npx prisma db push --accept-data-loss 2>/dev/null || true

echo "=== Building ==="
npm run build

echo "=== Verifying build ==="
ls .next/standalone/server.js || { echo "BUILD FAILED"; exit 1; }

echo "=== Fixing permissions ==="
chmod +x scripts/*.sh 2>/dev/null || true

echo "=== Restarting panel ==="
npm run pm2:start 2>&1 | tail -15

echo "=== Verifying ==="
sleep 5
curl -s http://127.0.0.1:80/api/panel/version
echo ""
curl -s -o /dev/null -w 'health: %{http_code}\n' http://127.0.0.1:80/api/health

echo "=== New version: $(grep '"version"' package.json | head -1) ==="
echo "=== Update complete ==="
