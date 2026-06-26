#!/usr/bin/env bash
# Create Umami websites and print env vars for marketing + panel.
set -euo pipefail

UMAMI_BASE="${UMAMI_BASE:-http://127.0.0.1:3002}"
UMAMI_USER="${UMAMI_USER:-admin}"
UMAMI_PASS="${UMAMI_PASS:-umami}"
PUBLIC_URL="${UMAMI_PUBLIC_URL:-https://stats.nexlify.live}"

login() {
  curl -sf -X POST "${UMAMI_BASE}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${UMAMI_USER}\",\"password\":\"${UMAMI_PASS}\"}"
}

token="$(login | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)"
if [[ -z "$token" ]]; then
  echo "Login failed. Set UMAMI_USER / UMAMI_PASS (change default password first)." >&2
  exit 1
fi

create_site() {
  local name="$1"
  local domain="$2"
  curl -sf -X POST "${UMAMI_BASE}/api/websites" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${name}\",\"domain\":\"${domain}\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id', d.get('websiteId','')))"
}

marketing_id="$(create_site "Nexlify marketing" "nexlify.live" || true)"
demo_id="$(create_site "Nexlify demo panel" "panel.demo.nexlify.live" || true)"
owner_id="$(create_site "Nexlify owner panel" "panel.nexlify.live" || true)"

echo ""
echo "=== Marketing site (.env on /var/www/nexlify) ==="
echo "NEXT_PUBLIC_UMAMI_URL=${PUBLIC_URL}"
echo "NEXT_PUBLIC_UMAMI_WEBSITE_ID=${marketing_id}"
echo ""
echo "=== Panel (.env on /home/nexlify-panel) ==="
echo "NEXT_PUBLIC_UMAMI_URL=${PUBLIC_URL}"
echo "NEXT_PUBLIC_UMAMI_WEBSITE_ID=${demo_id}"
echo "# For panel.nexlify.live use: ${owner_id}"
