#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%Y%m%d%H%M%S)
BACKUP="/home/nexlify-panel.bak-$STAMP"
PANEL="/home/nexlify-panel"
REPO="https://github.com/snookiebaby2022/Nexlify.git"

echo "=== Backup secrets and config ==="
cp "$PANEL/.env" /tmp/nexlify-panel.env.bak
if [ -d "$PANEL/.license-keys" ]; then
  cp -a "$PANEL/.license-keys" /tmp/nexlify-license-keys.bak
fi
if [ -f "$PANEL/ecosystem.config.cjs" ]; then
  cp "$PANEL/ecosystem.config.cjs" /tmp/nexlify-ecosystem.cjs.bak
fi

echo "=== Move old install to $BACKUP ==="
mv "$PANEL" "$BACKUP"

echo "=== Clone from GitHub ==="
git clone "$REPO" "$PANEL"
cp /tmp/nexlify-panel.env.bak "$PANEL/.env"
if [ -d /tmp/nexlify-license-keys.bak ]; then
  cp -a /tmp/nexlify-license-keys.bak "$PANEL/.license-keys"
fi
if [ -f /tmp/nexlify-ecosystem.cjs.bak ]; then
  cp /tmp/nexlify-ecosystem.cjs.bak "$PANEL/ecosystem.config.cjs"
fi

cd "$PANEL"
echo "=== Version ==="
grep '"version"' package.json | head -1

echo "=== npm install ==="
npm install --no-audit --no-fund

echo "=== prisma ==="
npx prisma db push --skip-generate
npx prisma generate

echo "=== build ==="
npm run build

echo "=== pm2 restart ==="
pm2 restart nexlify --update-env

echo "=== verify ==="
git remote -v
git rev-parse --short HEAD
grep '"version"' package.json | head -1
curl -s -o /dev/null -w 'login:%{http_code}\n' http://127.0.0.1:3000/login
echo "DONE backup=$BACKUP"
