#!/bin/bash
cd /opt/nexlify-panel
PORT=$(grep -E '^PORT=' .env | head -1 | cut -d= -f2- | tr -d '"')
PORT=${PORT:-13000}
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
PRIMARY=$(grep -E '^PANEL_PRIMARY_DOMAIN=' .env | head -1 | cut -d= -f2- | tr -d '"')

echo "=== Login on PRIMARY $PRIMARY ==="
curl -sS -c /tmp/pri-cookies.txt -o /tmp/pri-login.json -w 'login:%{http_code}\n' \
  --max-time 8 -H 'Content-Type: application/json' -H "Host: $PRIMARY" -A "$UA" \
  -d '{"username":"reseller","password":"reseller123"}' \
  "http://127.0.0.1:${PORT}/api/auth/login"
cat /tmp/pri-login.json
echo
curl -sS -b /tmp/pri-cookies.txt -o /dev/null -w 'dash:%{http_code} redirect:%{redirect_url}\n' \
  --max-time 8 -H "Host: $PRIMARY" -A "$UA" \
  "http://127.0.0.1:${PORT}/reseller/dashboard"
