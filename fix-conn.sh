#!/bin/bash
cd /opt/nexlify-panel

DB_URL=$(grep DATABASE_URL .env | head -1 | tr -d '"')
DB_USER=$(echo "$DB_URL" | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed 's|.*/||')

echo "=== Current state ==="
echo "LiveConnection:"
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM \"LiveConnection\";" 2>&1

echo ""
echo "Connection count API:"
curl -s -H 'User-Agent: MLA/2.1' 'http://127.0.0.1:80/player_api.php?username=test123&password=test123' | python3 -c "import sys,json; d=json.load(sys.stdin); print('Active:', d['user_info']['active_cons'], '/', d['user_info']['max_connections'])"

echo ""
echo "=== Connection limit message test ==="
echo "When you play a stream and hit the limit, you will see:"
echo "1. In your IPTV player: 'Max connections reached — you are using all allowed streams. Stop playback on other devices or increase your connection limit in the panel.'"
echo "2. In browser: 403 error with the same message"
echo "3. In admin panel Lines page: '1/1' in the Conns column"
echo ""
echo "The message appears in the player_api.php response as user_info.message"
echo "Most IPTV players (Smarters, TiviMate, etc.) display this message when it's non-empty"
