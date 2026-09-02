#!/bin/bash
echo "=== LINE 665577 DB ==="
sudo -u postgres psql -d nexlify -c "SELECT l.id, l.username, l.status, l.\"expiresAt\", l.\"maxConnections\", (SELECT count(*) FROM \"LineBouquet\" lb WHERE lb.\"lineId\"=l.id) AS bouquets FROM \"Line\" l WHERE l.username='665577';"
sudo -u postgres psql -d nexlify -c "SELECT b.name, b.\"isActive\", (SELECT count(*) FROM \"BouquetStream\" bs WHERE bs.\"bouquetId\"=b.id) AS streams FROM \"LineBouquet\" lb JOIN \"Bouquet\" b ON b.id=lb.\"bouquetId\" WHERE lb.\"lineId\"=(SELECT id FROM \"Line\" WHERE username='665577');"
echo "=== API Lavf (Nexus) ==="
curl -sS -m 15 -A 'Lavf/58.29.100' 'http://127.0.0.1:8080/player_api.php?username=665577&password=d4RfNK5qkE'
echo
echo "--- live_categories ---"
curl -sS -m 15 -A 'Lavf/58.29.100' 'http://127.0.0.1:8080/player_api.php?username=665577&password=d4RfNK5qkE&action=get_live_categories'
echo
echo "--- vod_categories ---"
curl -sS -m 15 -A 'Lavf/58.29.100' 'http://127.0.0.1:8080/player_api.php?username=665577&password=d4RfNK5qkE&action=get_vod_categories' | head -c 400
echo
