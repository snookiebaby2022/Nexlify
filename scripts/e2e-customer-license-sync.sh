#!/usr/bin/env bash
# E2E license sync test: nexlify.live admin -> customer panel (no customer SSH).
set -euo pipefail
CUSTOMER="http://75.119.137.174"
EMAIL="snookiebaby2022@gmail.com"
ROOT="/var/www/nexlify"
SECRET="$(grep '^PANEL_API_SECRET=' "$ROOT/.env" | cut -d= -f2- | tr -d '\r')"

echo "=== 1. Customer panel license status (before) ==="
curl -sS -m 15 "${CUSTOMER}/api/license/status" | python3 -m json.tool 2>/dev/null || curl -sS "${CUSTOMER}/api/license/status"
echo ""

echo "=== 2. Internal sync endpoint (no secret) ==="
code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -X POST "${CUSTOMER}/api/internal/license-sync" -H 'Content-Type: application/json' -d '{"action":"activate"}')"
echo "HTTP $code (expect 403 if endpoint exists)"

echo "=== 3. Latest unlimited license for $EMAIL ==="
KEY="$(sqlite3 "$ROOT/data/nexlify.db" "SELECT key FROM License l JOIN User u ON l.userId=u.id WHERE u.email='$EMAIL' AND l.notes LIKE '%unlimited%' ORDER BY l.createdAt DESC LIMIT 1;")"
if [ -z "$KEY" ]; then
  KEY="$(sqlite3 "$ROOT/data/nexlify.db" "SELECT key FROM License l JOIN User u ON l.userId=u.id WHERE u.email='$EMAIL' ORDER BY l.createdAt DESC LIMIT 1;")"
fi
LID="$(echo "$KEY" | python3 -c "import sys,base64,json; k=sys.stdin.read().strip(); p=k.split('.')[1]; print(json.loads(base64.urlsafe_b64decode(p+'=='))['lid'])")"
echo "lid=$LID key_prefix=${KEY:0:40}..."

echo "=== 4. Push REPLACE to customer panel ==="
resp="$(curl -sS -m 20 -X POST "${CUSTOMER}/api/internal/license-sync" \
  -H "x-panel-internal-secret: ${SECRET}" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c "import json; print(json.dumps({'action':'replace','licenseKey':'$KEY'}))")" \
  -w "\nHTTP:%{http_code}")"
echo "$resp"

echo "=== 5. Customer panel license status (after push) ==="
sleep 2
curl -sS -m 15 "${CUSTOMER}/api/license/status" | python3 -m json.tool 2>/dev/null || curl -sS "${CUSTOMER}/api/license/status"
echo ""

echo "=== 6. Register panel in marketing DB ==="
cd "$ROOT"
node -e "
const { PrismaClient } = require('./src/generated/prisma/client');
const p = new PrismaClient();
p.license.findFirst({ where: { key: process.argv[1] }, select: { panelUrl: true, machineId: true, pendingSyncAction: true, status: true } })
  .then(r => { console.log(JSON.stringify(r, null, 2)); return p.\$disconnect(); });
" "$KEY" 2>/dev/null || sqlite3 "$ROOT/data/nexlify.db" "SELECT panelUrl, machineId, pendingSyncAction, status FROM License WHERE key LIKE '${KEY:0:30}%' LIMIT 1;"

echo "=== DONE ==="
