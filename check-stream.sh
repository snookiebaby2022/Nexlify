#!/bin/bash
cat > /tmp/check-db.sh << 'ENDSCRIPT'
#!/bin/bash
echo "=== STREAMS ==="
PGPASSWORD=nexlify psql -h 127.0.0.1 -U nexlify -d nexlify -t -A -c "SELECT id, name, active FROM stream LIMIT 5;"
echo "=== USERS ==="
PGPASSWORD=nexlify psql -h 127.0.0.1 -U nexlify -d nexlify -t -A -c "SELECT id, username, active FROM panelUser LIMIT 5;"
echo "=== LINES ==="
PGPASSWORD=nexlify psql -h 127.0.0.1 -U nexlify -d nexlify -t -A -c "SELECT id, username, active FROM line LIMIT 5;"
echo "=== SERVERS ==="
PGPASSWORD=nexlify psql -h 127.0.0.1 -U nexlify -d nexlify -t -A -c "SELECT id, name, host, port, active FROM streamserver LIMIT 5;"
echo "=== CATEGORIES ==="
PGPASSWORD=nexlify psql -h 127.0.0.1 -U nexlify -d nexlify -t -A -c "SELECT id, name, type FROM streamcategory LIMIT 5;"
ENDSCRIPT
ssh root@85.17.162.54 "scp /tmp/check-db.sh root@75.119.137.174:/tmp/check-db.sh && ssh root@75.119.137.174 'bash /tmp/check-db.sh'"
