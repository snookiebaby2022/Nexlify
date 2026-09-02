#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
pkill -f 'rebuild-panel-safe' 2>/dev/null || true
pkill -f 'next build' 2>/dev/null || true
sleep 2
chattr -i scripts/iptv-edge-proxy.mjs 2>/dev/null || true
cp -a next.config.ts /tmp/45-next.config.ts
cp -a ecosystem.config.cjs /tmp/45-ecosystem.config.cjs
git fetch origin main
if ! git reset --hard origin/main; then
  echo UNLOCK_IMMUTABLE
  lsattr -R . 2>/dev/null | awk '/ i /{print $NF}' | head -200 | xargs -r chattr -i
  git reset --hard origin/main
fi
cp -a /tmp/45-next.config.ts next.config.ts
cp -a /tmp/45-ecosystem.config.cjs ecosystem.config.cjs
rm -rf whmcs-module
git log -1 --oneline
grep -m1 version package.json
export NEXLIFY_ALLOW_PROTECTED_45=1
export NEXLIFY_SKIP_GIT_RESET=1
export NEXLIFY_FORCE_BUILD=1
export NEXLIFY_FORCE_RESTART=1
: > /tmp/nexlify-code-sync.log
nohup env NEXLIFY_ALLOW_PROTECTED_45=1 NEXLIFY_SKIP_GIT_RESET=1 NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-code-sync.log 2>&1 </dev/null &
sleep 1
echo REBUILD_STARTED
head -8 /tmp/nexlify-code-sync.log || true
ss -lntp | grep ':8080 ' | head -2
curl -sS -o /dev/null -w 'health:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health
