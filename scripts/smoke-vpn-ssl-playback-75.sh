#!/usr/bin/env bash
# Smoke: unit tests, panel health, live-routing lock, optional live pull on 75.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== 1) Unit tests (VPN config + Certbot helpers) ==="
npx tsx --test src/lib/vpn-config.test.ts src/lib/certbot-utils.test.ts

echo "=== 2) Panel HTTP ==="
curl -sf -m 10 -o /dev/null -w "panel :13000 → %{http_code}\n" http://127.0.0.1:13000/c/ || echo "panel :13000 FAIL"

echo "=== 3) Live routing lock (panel must not proxy /live/) ==="
for port in 80 443 8080; do
  code=$(curl -sS -m 8 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${port}/live/test/u/p/1.ts" 2>/dev/null || echo "000")
  if [ "$code" = "502" ] || [ "$code" = "000" ]; then
    echo "  :${port}/live/ → ${code} (OK blocked or unreachable)"
  else
    echo "  :${port}/live/ → ${code} (WARN expected 502 on panel)"
  fi
done

echo "=== 4) Edge :8080 (expect 200/403/401, not 502 from panel proxy) ==="
edge_code=$(curl -sS -m 8 -o /dev/null -w "%{http_code}" "http://127.0.0.1:8080/" 2>/dev/null || echo "000")
echo "  edge root → ${edge_code}"

echo "=== 5) Let's Encrypt cert on disk (main server domain if set) ==="
DOMAIN=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.streamServer.findFirst({ where: { domain: { not: null } }, orderBy: { sortOrder: 'asc' } })
  .then(s => { console.log((s?.domain||'').trim()); return p.\$disconnect(); })
  .catch(() => { console.log(''); process.exit(0); });
" 2>/dev/null || true)
if [ -n "${DOMAIN:-}" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
else
  echo "  skip (no domain in DB or no cert file)"
fi

echo "=== 6) VPN local gateway (optional) ==="
if ss -tln 2>/dev/null | grep -q ':18080 '; then
  echo "  127.0.0.1:18080 listening"
  curl -sS -m 5 -x http://127.0.0.1:18080/ -o /dev/null -w "  proxy test → %{http_code}\n" http://example.com/ || true
else
  echo "  18080 not listening (VPN egress off — OK)"
fi

echo "=== SMOKE DONE ==="
