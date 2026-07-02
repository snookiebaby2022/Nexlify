#!/usr/bin/env bash
# Smarters/Xtream API smoke test on localhost (run on panel VPS).
set -uo pipefail
PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
for d in /opt/nexlify-panel /home/nexlify-panel "$(pwd)"; do
  [ -f "${d}/package.json" ] && [ -f "${d}/.env" ] && PANEL_DIR="$d" && break
done
cd "$PANEL_DIR"

PORT=$(grep '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || echo 13000)
PORT=${PORT:-13000}
BASE="http://127.0.0.1:${PORT}"
PRIMARY=$(grep '^PANEL_PRIMARY_DOMAIN=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r"' || echo "")
BEHIND=$(grep '^PANEL_BEHIND_NGINX=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r' || echo 0)

echo "=== Smarters API smoke ($BASE) domain=$PRIMARY ==="

# Ensure vendor/audit line exists when none active
if ! node scripts/ensure-smoke-test-line.cjs >/tmp/smoke-line.log 2>&1; then
  cat /tmp/smoke-line.log 2>/dev/null || true
fi

# Find first active line with a bouquet
LINE_JSON=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const line = await p.line.findFirst({
    where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
    include: { bouquets: { include: { bouquet: { include: { streams: { include: { stream: true } } } } } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!line) { console.log(''); process.exit(0); }
  const streams = [];
  for (const lb of line.bouquets) {
    if (!lb.bouquet.isActive) continue;
    for (const bs of lb.bouquet.streams) {
      if (bs.stream.isActive && bs.stream.type === 'LIVE') streams.push(bs.stream.name);
    }
  }
  console.log(JSON.stringify({ u: line.username, p: line.password, live: streams.length }));
  await p.\$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
" 2>/dev/null || echo "")

if [ -z "$LINE_JSON" ] || [ "$LINE_JSON" = '""' ]; then
  echo "SKIP: no active line in database — create a test line with bouquet first"
  curl -sS -o /dev/null -w "player_api_no_creds:%{http_code}\n" "$BASE/player_api.php" || true
  exit 0
fi

U=$(echo "$LINE_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).u)")
P=$(echo "$LINE_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).p)")
LIVE=$(echo "$LINE_JSON" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(0,'utf8')).live))")

echo "Line: $U (live streams in bouquets: $LIVE)"

QUERY=$(node -e "const u=process.argv[1],p=process.argv[2];console.log('username='+encodeURIComponent(u)+'&password='+encodeURIComponent(p))" "$U" "$P")
INFO=$(curl -sS --max-time 15 -w '\nHTTP:%{http_code}' "$BASE/player_api.php?${QUERY}")
HTTP=$(echo "$INFO" | tail -1 | sed 's/HTTP://')
BODY=$(echo "$INFO" | sed '$d')
echo "player_api HTTP $HTTP"
echo "server_info.port=$(echo "$BODY" | node -e "try{const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.server_info?.port+' proto='+j.server_info?.server_protocol+' https_port='+j.server_info?.https_port)}catch{console.log('parse_fail')}")"
AUTH=$(echo "$BODY" | node -e "try{const a=JSON.parse(require('fs').readFileSync(0,'utf8')).user_info?.auth;console.log(String(a))}catch{console.log('?')}")

if [ "$AUTH" != "1" ]; then
  echo "FAIL: auth=$AUTH"
  echo "Response: ${BODY:0:400}"
  exit 1
fi
echo "OK: auth=1"

if [ "$BEHIND" = "1" ] && [[ "$PRIMARY" != *.*.*.* ]] && echo "$INFO" | grep -q '"port":"8080"'; then
  echo "FAIL: HTTPS domain still advertises port 8080 in server_info"
  exit 1
fi

CATS=$(curl -sS --max-time 15 "$BASE/player_api.php?${QUERY}&action=get_live_categories")
CAT_COUNT=$(echo "$CATS" | node -e "try{const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(Array.isArray(j)?j.length:0)}catch{console.log(0)}")
echo "live_categories=$CAT_COUNT"
if [ "$LIVE" -gt 0 ] && [ "$CAT_COUNT" = "0" ]; then
  echo "FAIL: line has $LIVE live streams but 0 categories returned"
  exit 1
fi
if [ "$CAT_COUNT" -gt 0 ]; then
  echo "OK: categories returned"
else
  echo "WARN: no categories (assign bouquet + live streams to line)"
fi

# External edge if domain install
if [ "$BEHIND" = "1" ] && [[ "$PRIMARY" != *.*.*.* ]]; then
  EXT=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://${PRIMARY}/player_api.php?${QUERY}" 2>/dev/null || echo 000)
  echo "external_https:${PRIMARY} HTTP $EXT"
fi

echo "=== Smarters smoke PASSED ==="
