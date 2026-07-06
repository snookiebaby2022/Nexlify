#!/bin/bash
set -e
cd /opt/nexlify-panel

echo "=== STEP 1: Restore ecosystem.config.cjs from git ==="
git checkout -- ecosystem.config.cjs
cat ecosystem.config.cjs | head -5
echo "... restored"

echo "=== STEP 2: Disable nginx (panel owns port 80 directly) ==="
systemctl stop nginx 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true
echo "nginx disabled"

echo "=== STEP 3: Ensure PORT=80 in .env (IP install, direct on 80) ==="
# ensure-panel-env.sh forces PORT=80 for IP installs — don't fight it
grep -q "^PORT=" .env && sed -i 's/^PORT=.*/PORT=80/' .env || echo "PORT=80" >> .env
grep -q "^PANEL_PORT=" .env && sed -i 's/^PANEL_PORT=.*/PANEL_PORT=80/' .env || echo "PANEL_PORT=80" >> .env
grep -q "^PANEL_BIND_HOST=" .env && sed -i 's/^PANEL_BIND_HOST=.*/PANEL_BIND_HOST=0.0.0.0/' .env || echo "PANEL_BIND_HOST=0.0.0.0" >> .env
grep -q "^PANEL_PUBLIC_PORT=" .env && sed -i 's/^PANEL_PUBLIC_PORT=.*/PANEL_PUBLIC_PORT=80/' .env || echo "PANEL_PUBLIC_PORT=80" >> .env
grep -q "^STREAM_HTTP_PORT=" .env && sed -i 's/^STREAM_HTTP_PORT=.*/STREAM_HTTP_PORT=8080/' .env || echo "STREAM_HTTP_PORT=8080" >> .env
grep -q "^STREAM_EDGE_PORT=" .env && sed -i 's/^STREAM_EDGE_PORT=.*/STREAM_EDGE_PORT=8080/' .env || echo "STREAM_EDGE_PORT=8080" >> .env
echo "PORT=80 in .env"

echo "=== STEP 4: Fix file permissions ==="
chmod +x scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.mjs 2>/dev/null || true

echo "=== STEP 5: Kill any orphan processes on port 80 ==="
pm2 delete nexlify 2>/dev/null || true
pkill -f 'next/dist/bin/next' 2>/dev/null || true
pkill -f '.next/standalone/server' 2>/dev/null || true
sleep 2

echo "=== STEP 6: Prepare standalone and restart ==="
bash scripts/prepare-standalone.sh 2>/dev/null || true
npm run pm2:start 2>&1 | tail -20

sleep 5
echo "=== STEP 7: Verify ==="
curl -s -o /dev/null -w 'health: %{http_code}\n' http://127.0.0.1:80/api/health
curl -s -o /dev/null -w 'login (browser): %{http_code}\n' -H 'User-Agent: Mozilla/5.0 Chrome/131' http://127.0.0.1:80/login
curl -s http://127.0.0.1:80/api/panel/version
echo ""
pm2 status
grep '"version"' package.json | head -1
echo ""
echo "=== DONE — Panel on port 80, no nginx ==="
