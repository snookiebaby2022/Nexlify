#!/bin/bash
set -u
left=$(sudo -u postgres psql -d nexlify -At -c "SELECT COUNT(*) FROM junk_exact_name_drops")
echo "drop_list=$left"

echo "=== DETACH PARENT LINKS ==="
while true; do
  n=$(sudo -u postgres psql -d nexlify -v ON_ERROR_STOP=1 -At <<'SQL'
SET lock_timeout = '5s';
SET statement_timeout = '60s';
WITH batch AS (SELECT id FROM junk_exact_name_drops LIMIT 400)
UPDATE "Stream" s
SET "parentStreamId" = NULL
FROM batch b
WHERE s."parentStreamId" = b.id;
SQL
  ) || { echo parent_retry; sleep 1; continue; }
  n=$(echo "$n" | tr -dc '0-9')
  n=${n:-0}
  echo "detached_parents=$n"
  [ "$n" = "0" ] && break
done

echo "=== CLEAR LIVECONN ON DROPS ==="
sudo -u postgres psql -d nexlify -v ON_ERROR_STOP=1 <<'SQL'
SET statement_timeout = '60s';
UPDATE "LiveConnection" lc
SET "streamId" = NULL
WHERE lc."streamId" IN (SELECT id FROM junk_exact_name_drops);
SQL

echo "=== BATCH DELETE STREAMS ==="
total=0
fail=0
while [ "$fail" -lt 8 ]; do
  n=$(sudo -u postgres psql -d nexlify -v ON_ERROR_STOP=1 -At <<'SQL' 2>/tmp/del.err
SET lock_timeout = '5s';
SET statement_timeout = '60s';
WITH batch AS (
  DELETE FROM junk_exact_name_drops
  WHERE id IN (SELECT id FROM junk_exact_name_drops LIMIT 80)
  RETURNING id
)
DELETE FROM "Stream" s
USING batch b
WHERE s.id = b.id;
SQL
)
  if [ $? -ne 0 ]; then
    fail=$((fail + 1))
    echo "RETRY $fail $(head -c 200 /tmp/del.err)"
    sleep 2
    continue
  fi
  fail=0
  n=$(echo "$n" | tr -dc '0-9')
  n=${n:-0}
  if [ "$n" = "0" ]; then
    echo APPLY_DONE total=$total
    break
  fi
  total=$((total + n))
  echo "deleted=$n total=$total left=$(sudo -u postgres psql -d nexlify -At -c 'SELECT COUNT(*) FROM junk_exact_name_drops')"
done

echo "=== AFTER ==="
sudo -u postgres psql -d nexlify <<'SQL'
SELECT c.name, COUNT(*) AS n
FROM "Stream" s
JOIN "Category" c ON c.id = s."categoryId"
WHERE c.name IN (
  'UK | Entertainment','UK | Entertainment (HEVC)',
  'UK | Sky Sports','UK | Sky Sports +','UK | Sky Sports + EFL',
  'UK | Sky Sports / TNT Sports (HEVC)',
  'UK | Movies','UK | Movies (HEVC)',
  'UK | News','UK | Kids',
  'UK | Documentaries','UK | Documentary'
)
GROUP BY c.name
ORDER BY c.name;
SELECT 'live_total', COUNT(*) FROM "Stream" WHERE type='LIVE' AND "isRadio"=false;
SQL
echo DEDUPE_OK
