#!/bin/bash
cd /opt/nexlify-panel

DB_URL=$(grep DATABASE_URL .env | head -1 | tr -d '"')
DB_USER=$(echo "$DB_URL" | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed 's|.*/||')

echo "=== BLOCKED ISPS ==="
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT * FROM \"BlockedIsp\" WHERE \"isActive\" = true;" 2>&1

echo ""
echo "=== BLOCKED ASNS ==="
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT * FROM \"BlockedAsn\" WHERE \"isActive\" = true;" 2>&1

echo ""
echo "=== BLOCKED IPS ==="
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT * FROM \"BlockedIp\" WHERE \"isActive\" = true;" 2>&1

echo ""
echo "=== LINE lockToIp status ==="
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT id, username, \"lockToIp\", \"allowedIps\" FROM \"Line\";" 2>&1

echo ""
echo "=== GEO SETTINGS ==="
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT value FROM \"Setting\" WHERE key = 'geo';" 2>&1
