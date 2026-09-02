#!/bin/bash
set -u
echo "=== STOP STUCK SQL ==="
sudo -u postgres psql -d nexlify -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND state='active' AND query ILIKE '%drop_live%' AND pid <> pg_backend_pid();" || true
sleep 1

echo "=== DELETE EXACT-NAME COPIES ==="
sudo -u postgres psql -d nexlify -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE TEMP TABLE drop_live AS
SELECT id
FROM (
  SELECT
    s.id,
    ROW_NUMBER() OVER (
      PARTITION BY s."categoryId", lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g'))
      ORDER BY
        COALESCE(b.n, 0) DESC,
        CASE WHEN COALESCE(s."streamIcon", '') <> '' THEN 0 ELSE 1 END,
        CASE WHEN s."isActive" THEN 0 ELSE 1 END,
        s."createdAt" ASC,
        s.id ASC
    ) AS rn
  FROM "Stream" s
  LEFT JOIN (
    SELECT "streamId", COUNT(*)::int AS n
    FROM "BouquetStream"
    GROUP BY "streamId"
  ) b ON b."streamId" = s.id
  WHERE s.type = 'LIVE'
    AND s."isRadio" = false
    AND s."categoryId" IS NOT NULL
    AND btrim(s.name) <> ''
) x
WHERE rn > 1;

SELECT 'to_delete=' || COUNT(*) FROM drop_live;

DELETE FROM "Stream" s
USING drop_live d
WHERE s.id = d.id;

COMMIT;
SQL

echo "=== AFTER ==="
sudo -u postgres psql -d nexlify <<'SQL'
SELECT c.name, COUNT(*) AS n
FROM "Stream" s
JOIN "Category" c ON c.id = s."categoryId"
WHERE c.name IN (
  'UK | Entertainment','UK | ENTERTAINMENT','UK | Entertainment (HEVC)',
  'UK | Sky Sports','UK | Sky Sports +','UK | SKY SPORTS +','UK | Sky Sports + EFL',
  'UK | Sky Sports / TNT Sports (HEVC)',
  'UK | Movies','UK | MOVIES','UK | Movies (HEVC)',
  'UK | News','UK | NEWS','UK | Kids','UK | KIDS',
  'UK | Documentaries','UK | DOCUMENTARIES','UK | Documentary'
)
GROUP BY c.name
ORDER BY c.name;

SELECT 'live_total' AS k, COUNT(*)::text FROM "Stream" WHERE type='LIVE' AND "isRadio"=false
UNION ALL
SELECT 'caps_left', COUNT(*)::text FROM "Category" WHERE "categoryType"='LIVE' AND name IN (
  'UK | ENTERTAINMENT','UK | SKY SPORTS +','UK | MOVIES','UK | NEWS','UK | KIDS','UK | DOCUMENTARIES'
);
SQL
echo DEDUPE_OK
