#!/usr/bin/env bash
# Create isolated PostgreSQL database for marketing site (never use panel DB).
# Run on VPS as root: bash scripts/setup-marketing-database.sh

set -u

MARKETING="${1:-/var/www/nexlify}"
PANEL_ENV="/home/nexlify-panel/.env"
[ -f "$PANEL_ENV" ] || PANEL_ENV="/opt/nexlify-panel/.env"

DB_NAME="nexlify_marketing"

echo "=== Marketing database setup ==="

if [ -f "$(dirname "$0")/ensure-marketing-database-url.sh" ]; then
  bash "$(dirname "$0")/ensure-marketing-database-url.sh" "$MARKETING"
else
  # Fallback if ensure script missing
  if [ ! -f "$PANEL_ENV" ]; then
    echo "ERROR: Panel .env not found — cannot derive DB credentials"
    exit 1
  fi
  PANEL_DB=$(grep -m1 '^DATABASE_URL=' "$PANEL_ENV" | sed 's/^DATABASE_URL=//' | tr -d '"')
  USER_PASS=$(echo "$PANEL_DB" | sed -E 's|^postgresql://([^@]+)@.*|\1|')
  HOST_PORT=$(echo "$PANEL_DB" | sed -E 's|^postgresql://[^@]+@([^/]+)/.*|\1|')
  MARKETING_URL="postgresql://${USER_PASS}@${HOST_PORT}/${DB_NAME}"
  export DATABASE_URL="$MARKETING_URL"
fi

# shellcheck disable=SC1091
MARKETING_DIR="$MARKETING"
source "$MARKETING/scripts/load-marketing-env.sh"

echo "-> Pushing marketing schema to $DB_NAME..."
cd "$MARKETING"
npx prisma db push --accept-data-loss 2>&1 | tail -8

echo "-> Syncing plans..."
npx tsx scripts/sync-plans-vps.ts 2>&1 | tail -6

echo "-> Seeding admin..."
npx tsx prisma/seed.ts 2>&1 | tail -6

echo ""
echo "Marketing DATABASE_URL set to: ${DB_NAME}"
echo "Panel database (nexlify) is untouched by this script."
echo "Done."
