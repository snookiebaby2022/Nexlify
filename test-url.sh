#!/bin/bash
# Test actual stream playback
echo "=== TEST LIVE STREAM ==="
curl -s -o /dev/null -w 'live_stream: %{http_code}\n' -H 'User-Agent: MLA/2.1' 'http://127.0.0.1:80/live/test123/test123/cmr58thlg000nkva3mj7r9ql4.ts' --max-time 5

echo ""
echo "=== TEST HLS MANIFEST ==="
curl -s -o /dev/null -w 'hls: %{http_code}\n' -H 'User-Agent: MLA/2.1' 'http://127.0.0.1:80/live/test123/test123/cmr58thlg000nkva3mj7r9ql4.m3u8' --max-time 5

echo ""
echo "=== MAX CONNECTIONS ISSUE ==="
curl -s -H 'User-Agent: MLA/2.1' 'http://127.0.0.1:80/player_api.php?username=test123&password=test123' | python3 -c "import sys,json; d=json.load(sys.stdin); print('Status:', d['user_info']['status']); print('Active:', d['user_info']['active_cons']); print('Max:', d['user_info']['max_connections']); print('Message:', d['user_info'].get('message','none'))"

echo ""
echo "=== STREAM SOURCE ==="
cat > /tmp/q.sql << 'EOSQL'
SELECT s.name, s."streamSource", s."streamType", s.active FROM stream s LIMIT 5;
EOSQL
PGPASSWORD=nexlify psql -h 127.0.0.1 -U nexlify -d nexlify -f /tmp/q.sql 2>&1 | head -10

echo ""
echo "=== STREAM SERVER ==="
cat > /tmp/q2.sql << 'EOSQL'
SELECT ss.name, ss.host, ss.port, ss.protocol, ss.active FROM streamserver ss LIMIT 5;
EOSQL
PGPASSWORD=nexlify psql -h 127.0.0.1 -U nexlify -d nexlify -f /tmp/q2.sql 2>&1 | head -10
