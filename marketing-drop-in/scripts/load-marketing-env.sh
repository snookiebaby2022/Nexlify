#!/usr/bin/env bash
# Source marketing .env with DATABASE_URL guaranteed. Usage:
#   source /var/www/nexlify/scripts/load-marketing-env.sh
#   echo "$DATABASE_URL"

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
ENV_FILE="$MARKETING/.env"

if [ ! -f "$ENV_FILE" ] || ! grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null; then
  bash "$MARKETING/scripts/ensure-marketing-database-url.sh" "$MARKETING"
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL still missing after ensure-marketing-database-url.sh" >&2
  return 1 2>/dev/null || exit 1
fi
