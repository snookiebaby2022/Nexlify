#!/bin/bash
set -euo pipefail
SRC=/tmp/lg-auth-fix
DST=/opt/nexlify-panel
UA='Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager'

echo '=== BEFORE (origin :80) ==='
echo -n 'GET no creds: '
curl -sS -o /tmp/pa-before.json -w '%{http_code}\n' --max-time 8 -A "$UA" -H 'Host: darkcdn.store' 'http://127.0.0.1/player_api.php' || true
head -c 220 /tmp/pa-before.json; echo
echo -n 'HEAD no creds: '
curl -sSI --max-time 8 -A "$UA" -H 'Host: darkcdn.store' 'http://127.0.0.1/player_api.php' | tr -d '\r' | awk 'NR==1{print}'
echo -n 'public HTTP: '
curl -sS -o /dev/null -w '%{http_code} redirect:%{redirect_url}\n' --max-time 8 -A "$UA" 'http://darkcdn.store/player_api.php' || true
echo -n 'public HTTPS: '
curl -sS -o /dev/null -w '%{http_code} http:%{http_version}\n' --max-time 8 -A "$UA" 'https://darkcdn.store/player_api.php' || true

install -D -m 0644 "$SRC/player_api.route.ts" "$DST/src/app/player_api.php/route.ts"
install -D -m 0644 "$SRC/panel_api.route.ts" "$DST/src/app/panel_api.php/route.ts"
install -D -m 0644 "$SRC/xtream.ts" "$DST/src/lib/xtream.ts"
install -D -m 0644 "$SRC/xtream-unauth.ts" "$DST/src/lib/xtream-unauth.ts"
install -D -m 0644 "$SRC/xtream-unauth.test.ts" "$DST/src/lib/xtream-unauth.test.ts"
install -D -m 0644 "$SRC/line-restrictions.ts" "$DST/src/lib/line-restrictions.ts"
install -D -m 0644 "$SRC/line-restrictions.test.ts" "$DST/src/lib/line-restrictions.test.ts"
grep -n xtreamUnauthPayload "$DST/src/app/player_api.php/route.ts" | head -3
grep -n userAgentIsSmartTv "$DST/src/lib/xtream.ts" | head -5

cd "$DST"
echo '=== unit tests ==='
npx --no-install tsx --test src/lib/line-restrictions.test.ts src/lib/xtream-unauth.test.ts

echo '=== start rebuild if not already running ==='
if flock -n /tmp/nexlify-rebuild.lock -c true; then
  nohup env NEXLIFY_ALLOW_PROTECTED_45=1 NEXLIFY_SKIP_GIT_RESET=1 NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 \
    bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-lg-auth-rebuild.log 2>&1 </dev/null &
  echo REBUILD_STARTED:$!
else
  echo REBUILD_ALREADY_RUNNING
  tail -5 /tmp/nexlify-lg-smarters-rebuild.log /tmp/nexlify-lg-auth-rebuild.log /tmp/nexlify-code-sync.log 2>/dev/null || true
fi
ss -ltnp | awk '/:8080 /{print; exit}'
curl -sS -o /dev/null -w 'health:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health
echo INSTALL_OK
