#!/bin/bash
set -euo pipefail
rm -rf /tmp/marketing-full-drop-in
mkdir -p /tmp/marketing-full-drop-in
tar -xzf /tmp/marketing-drop-in.tar.gz -C /tmp/marketing-full-drop-in
DEST=/var/www/nexlify
rsync -a --exclude .next --exclude node_modules --exclude .env --exclude .env.local --exclude .env.production --exclude data --exclude src/generated /tmp/marketing-full-drop-in/ "$DEST/"
if [ -f /home/nexlify/src/lib/panel-releases.json ]; then
  cp -f /home/nexlify/src/lib/panel-releases.json "$DEST/src/lib/panel-releases.json"
  cp -f /home/nexlify/src/lib/panel-releases.json "$DEST/public/panel-releases.json"
fi
cd "$DEST"
npm install --no-audit --no-fund
npm run build
pm2 restart nexlify-web || pm2 restart nexlify-marketing || true
echo MARKETING_DONE
grep -m1 latestVersion /var/www/nexlify/public/panel-releases.json || true
curl -sS -o /dev/null -w 'site:%{http_code}\n' --max-time 10 -H 'Host: nexlify.live' http://127.0.0.1/ || true
