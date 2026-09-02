#!/bin/bash
set -eo pipefail
cd /opt/nexlify-panel
PORT=$(grep -E '^PORT=' .env | head -1 | cut -d= -f2- | tr -d '"')
PORT=${PORT:-13000}
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
HOST='Sulu.xyz'

echo "=== Login on $HOST ==="
curl -sS -c /tmp/reseller-cookies.txt -o /tmp/reseller-login.json -w 'login:%{http_code}\n' \
  --max-time 8 \
  -H 'Content-Type: application/json' \
  -H "Host: $HOST" \
  -A "$UA" \
  -d '{"username":"reseller","password":"reseller123"}' \
  "http://127.0.0.1:${PORT}/api/auth/login"
cat /tmp/reseller-login.json
echo

echo "=== Dashboard on $HOST (with cookie) ==="
curl -sS -b /tmp/reseller-cookies.txt -o /dev/null -w 'dash:%{http_code} redirect:%{redirect_url}\n' \
  --max-time 8 -H "Host: $HOST" -A "$UA" \
  "http://127.0.0.1:${PORT}/reseller/dashboard"

echo "=== Dashboard on primary (with cookie) ==="
PRIMARY=$(grep -E '^PANEL_PRIMARY_DOMAIN=' .env | head -1 | cut -d= -f2- | tr -d '"')
curl -sS -b /tmp/reseller-cookies.txt -o /dev/null -w 'dash:%{http_code} redirect:%{redirect_url}\n' \
  --max-time 8 -H "Host: $PRIMARY" -A "$UA" \
  "http://127.0.0.1:${PORT}/reseller/dashboard"

echo "=== API credentials baseUrl (simulate) ==="
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.panelUser.findFirst({ where: { resellerDns: "Sulu.xyz" }, select: { username: true, resellerDns: true } })
  .then((u) => { console.log(JSON.stringify(u)); return p.$disconnect(); });
NODE
