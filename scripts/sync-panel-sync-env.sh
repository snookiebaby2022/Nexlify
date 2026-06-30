#!/usr/bin/env bash
# Write public panel-sync.env for customer installers (fetched during panel install).
set -euo pipefail
ROOT="${1:-/var/www/nexlify}"
ENV="$ROOT/.env"
OUT="$ROOT/public/install/panel-sync.env"
mkdir -p "$(dirname "$OUT")"
secret="$(grep '^PANEL_API_SECRET=' "$ENV" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)"
if [ -z "$secret" ]; then
  echo "WARN: PANEL_API_SECRET missing in $ENV — customer installs will not auto-sync licenses" >&2
  exit 0
fi
printf 'PANEL_API_SECRET=%s\n' "$secret" > "$OUT"
chmod 644 "$OUT"
echo "Wrote $OUT"
