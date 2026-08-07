#!/usr/bin/env bash
# Ensure /var/www/nexlify/.env has DATABASE_URL=nexlify_marketing (never the panel DB).
# Run: bash scripts/ensure-marketing-database-url.sh [/var/www/nexlify]

set -euo pipefail

MARKETING="${1:-/var/www/nexlify}"
ENV_FILE="$MARKETING/.env"
DB_NAME="nexlify_marketing"

find_panel_env() {
  for p in /home/nexlify-panel/.env /opt/nexlify-panel/.env; do
    [ -f "$p" ] && echo "$p" && return 0
  done
  return 1
}

panel_env="$(find_panel_env || true)"
if [ -z "$panel_env" ]; then
  echo "ERROR: Panel .env not found — cannot derive PostgreSQL credentials"
  exit 1
fi

PANEL_DB="$(grep -m1 '^DATABASE_URL=' "$panel_env" | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")"
if [ -z "$PANEL_DB" ]; then
  echo "ERROR: DATABASE_URL missing in $panel_env"
  exit 1
fi

# Block accidental panel DB URL on marketing site
if echo "$PANEL_DB" | grep -qE '/nexlify([/?]|$)'; then
  USER_PASS="$(echo "$PANEL_DB" | sed -E 's|^postgresql://([^@]+)@.*|\1|')"
  HOST_PORT="$(echo "$PANEL_DB" | sed -E 's|^postgresql://[^@]+@([^/]+)/.*|\1|')"
  MARKETING_URL="postgresql://${USER_PASS}@${HOST_PORT}/${DB_NAME}"
else
  MARKETING_URL="$(echo "$PANEL_DB" | sed -E "s|/[^/?]+(\?.*)?$|/${DB_NAME}\\1|")"
fi

echo "-> Ensuring PostgreSQL database ${DB_NAME}..."
if command -v psql >/dev/null 2>&1; then
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME};"
else
  echo "   WARNING: psql not found — skipping CREATE DATABASE"
fi

mkdir -p "$MARKETING"
touch "$ENV_FILE"
grep -v '^DATABASE_URL=' "$ENV_FILE" > "${ENV_FILE}.tmp" 2>/dev/null || true
mv "${ENV_FILE}.tmp" "$ENV_FILE"
echo "DATABASE_URL=\"${MARKETING_URL}\"" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "DATABASE_URL set to ${DB_NAME} in $ENV_FILE"
export DATABASE_URL="$MARKETING_URL"
