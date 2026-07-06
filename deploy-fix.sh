#!/bin/bash
set -e
cd /opt/nexlify-panel

echo "=== Pulling latest code ==="
git fetch origin main
git pull origin main

echo "=== Building ==="
npm install --no-audit --no-fund --loglevel=error
npx prisma generate
npm run build 2>&1 | tail -5

echo "=== Verifying ==="
ls .next/standalone/server.js && echo "BUILD OK"

echo "=== Restarting ==="
npm run pm2:start 2>&1 | tail -10

sleep 5
echo "=== Verifying ==="
curl -s http://127.0.0.1:80/api/panel/version
echo ""
echo "=== DONE ==="
