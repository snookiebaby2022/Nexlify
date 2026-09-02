#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "=== LIVE CONNS ==="
psql "$DATABASE_URL" -Atc "SELECT count(*) FROM \"LiveConnection\" WHERE \"lastSeenAt\" > now() - interval '2 minutes';"

echo "=== TOP WATCHED (now) ==="
psql "$DATABASE_URL" -c "
SELECT s.name, count(*) AS viewers
FROM \"LiveConnection\" lc
JOIN \"Stream\" s ON s.id = lc.\"streamId\"
WHERE lc.\"lastSeenAt\" > now() - interval '2 minutes'
GROUP BY 1 ORDER BY 2 DESC LIMIT 15;"

echo "=== SKY SPORTS UK ==="
psql "$DATABASE_URL" -c "
SELECT s.id, s.name, left(s.\"streamUrl\", 75) AS url
FROM \"Stream\" s
JOIN \"Category\" c ON c.id = s.\"categoryId\"
WHERE s.type = 'LIVE' AND s.\"isActive\" = true
  AND c.name ILIKE '%UK%'
  AND s.name ILIKE '%sky%sport%'
ORDER BY s.name LIMIT 20;"

echo "=== ADULT LIVE (sample) ==="
psql "$DATABASE_URL" -c "
SELECT s.name, left(s.\"streamUrl\", 75) AS url
FROM \"Stream\" s
JOIN \"Category\" c ON c.id = s.\"categoryId\"
WHERE s.type = 'LIVE' AND s.\"isActive\" = true
  AND (c.name ILIKE '%adult%' OR c.name ILIKE '%xxx%')
ORDER BY s.name LIMIT 15;"

echo "=== PANEL QoE idleMs in build ==="
grep -r 'PLAYER_STALL_IDLE_MS\|idleMs' src/lib/connection-quality-live.ts .next/server/chunks 2>/dev/null | head -3 || echo 'check source only'
grep 'PLAYER_STALL_IDLE_MS' src/lib/connection-quality-live.ts || true

echo "=== 10GBS EDGE ==="
ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@209.237.141.15 \
  'pm2 jlist 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); e=[x for x in d if x.get(\"name\")==\"nexlify-iptv-edge\"]; print(e[0][\"pm2_env\"][\"status\"] if e else \"missing\")"; grep -m1 MAX_CLIENT_LAG_BYTES /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs; ss -lntp | grep :8080 | head -1' \
  || echo '10gbs unreachable'
