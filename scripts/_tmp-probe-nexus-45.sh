#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel

echo "=== REDIS QoE key count ==="
redis-cli --scan --pattern 'conn:q:*' 2>/dev/null | wc -l
echo "sample:"
redis-cli --scan --pattern 'conn:q:*' 2>/dev/null | head -3 | while read -r k; do
  echo "$k -> $(redis-cli get "$k" | head -c 200)"
done

echo "=== Nexus player_api probe (sme_snooki_c7weo) ==="
U=$(sudo -u postgres psql -d nexlify -t -A -c "SELECT username FROM \"Line\" WHERE username='sme_snooki_c7weo' LIMIT 1;")
P=$(sudo -u postgres psql -d nexlify -t -A -c "SELECT password FROM \"Line\" WHERE username='sme_snooki_c7weo' LIMIT 1;")
UA='NexusTV/1.0'
echo "user_info:"
curl -sS -m 20 -A "$UA" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}" | head -c 600
echo
echo "live_categories count:"
curl -sS -m 30 -A "$UA" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_categories" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else d)"
echo "vod_categories count:"
curl -sS -m 30 -A "$UA" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_vod_categories" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else d)"
echo "first live category streams:"
CAT=$(curl -sS -m 30 -A "$UA" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_categories" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['category_id'] if d else '')")
echo "category_id=$CAT"
curl -sS -m 30 -A "$UA" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_streams&category_id=${CAT}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('streams', len(d) if isinstance(d,list) else d)"

echo "=== Recent Nexus nginx hits ==="
grep -i 'NexusTV' /var/log/nginx/access.log 2>/dev/null | tail -20 || true

echo "=== Lines with allowedUserAgents set (recent) ==="
sudo -u postgres psql -d nexlify -c "SELECT username, left(\"allowedUserAgents\",40) AS ua, (SELECT count(*) FROM \"LineBouquet\" lb WHERE lb.\"lineId\"=l.id) AS bq FROM \"Line\" l WHERE \"allowedUserAgents\" IS NOT NULL AND \"allowedUserAgents\" <> '' AND \"allowedUserAgents\" <> '[]' ORDER BY \"updatedAt\" DESC NULLS LAST LIMIT 10;"
