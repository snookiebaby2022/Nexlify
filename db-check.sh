#!/bin/bash
cd /opt/nexlify-panel

echo "=== TEST live stream route ==="
# Test the exact URL the user is playing
curl -v -H 'User-Agent: MLA/2.1 (Linux; Android 12)' 'http://127.0.0.1:80/live/test123/test123/cmr58thlg000nkva3mj7r9ql4.ts' 2>&1 | head -30

echo ""
echo "=== CHECK LiveConnection after test ==="
DB_URL=$(grep DATABASE_URL .env | head -1 | tr -d '"')
DB_USER=$(echo "$DB_URL" | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed 's|.*/||')
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT count(*) FROM \"LiveConnection\";" 2>&1

echo ""
echo "=== FULL PM2 ERROR LOG ==="
pm2 logs nexlify --lines 50 --nostream 2>&1 | grep -v "^$" | tail -30
