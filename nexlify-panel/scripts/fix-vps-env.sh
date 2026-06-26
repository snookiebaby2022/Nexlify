#!/usr/bin/env bash
# Fix common .env mistakes on the main VPS (run once on server).
set -euo pipefail
cd "$(dirname "$0")/.."
ENV=".env"
[ -f "$ENV" ] || { echo "No .env"; exit 1; }

# Split REDIS_URL merged with NEXLIFY_LICENSE_SKIP (no newline)
if grep -q '6379NEXLIFY_LICENSE_SKIP' "$ENV" 2>/dev/null; then
  sed -i 's|6379NEXLIFY_LICENSE_SKIP=1|6379\nNEXLIFY_LICENSE_SKIP=1|' "$ENV"
  echo "Fixed REDIS_URL / LICENSE_SKIP line break"
fi

grep -q '^NEXLIFY_LICENSE_API_URL=' "$ENV" || echo 'NEXLIFY_LICENSE_API_URL=http://127.0.0.1:8787' >> "$ENV"
grep -q '^NEXLIFY_LICENSE_API_LOCAL=' "$ENV" || echo 'NEXLIFY_LICENSE_API_LOCAL=1' >> "$ENV"
grep -q '^NEXLIFY_LICENSE_COOKIE_SECURE=' "$ENV" || echo 'NEXLIFY_LICENSE_COOKIE_SECURE=0' >> "$ENV"
grep -q '^PANEL_DEMO_NO_LICENSE=' "$ENV" || echo 'PANEL_DEMO_NO_LICENSE=1' >> "$ENV"
grep -q '^PANEL_PRIMARY_DOMAIN=' "$ENV" || echo 'PANEL_PRIMARY_DOMAIN=panel.nexlify.live' >> "$ENV"

# Panel on same host should talk to license server via loopback
sed -i 's|^NEXLIFY_LICENSE_API_URL=http://85\.17\.162\.54:8787|NEXLIFY_LICENSE_API_URL=http://127.0.0.1:8787|' "$ENV" 2>/dev/null || true

if [ -f .license-keys/private.pem ]; then
  npm run license:derive-public --silent 2>/dev/null || true
  if [ -f .license-keys/public.pem ]; then
    npm run license:sync-public-key --silent 2>/dev/null || true
  fi
fi

echo "License-related .env:"
grep -E 'NEXLIFY_LICENSE|LICENSE_SERVER|REDIS_URL' "$ENV" || true
