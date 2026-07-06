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
ENDSCRIPT
