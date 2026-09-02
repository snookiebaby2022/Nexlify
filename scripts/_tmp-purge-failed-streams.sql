-- Purge inactive + probe-failed live streams. Never-probed (lastProbeOk IS NULL) stay.
-- Skip anything with a live connection in the last 3 minutes.
BEGIN;

CREATE TEMP TABLE doomed_streams ON COMMIT DROP AS
SELECT s.id
FROM "Stream" s
WHERE (
    s."isActive" = false
    OR (s.type = 'LIVE' AND s."isActive" = true AND s."lastProbeOk" = false)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "LiveConnection" c
    WHERE c."streamId" = s.id
      AND c."lastSeenAt" > NOW() - INTERVAL '3 minutes'
  );

SELECT
  (SELECT COUNT(*) FROM doomed_streams) AS to_delete,
  (SELECT COUNT(*) FROM "Stream" s
    WHERE (
      s."isActive" = false
      OR (s.type = 'LIVE' AND s."isActive" = true AND s."lastProbeOk" = false)
    )
    AND EXISTS (
      SELECT 1 FROM "LiveConnection" c
      WHERE c."streamId" = s.id AND c."lastSeenAt" > NOW() - INTERVAL '3 minutes'
    )
  ) AS skipped_live;

DELETE FROM "Stream" WHERE id IN (SELECT id FROM doomed_streams);

COMMIT;

SELECT
  COUNT(*) FILTER (WHERE "isActive" = false) AS inactive,
  COUNT(*) FILTER (WHERE type = 'LIVE' AND "isActive" = true AND "lastProbeOk" = false) AS failed_source,
  COUNT(*) FILTER (WHERE type = 'LIVE' AND "isActive" = true AND "lastProbeOk" IS NULL) AS never_probed,
  COUNT(*) FILTER (WHERE type = 'LIVE' AND "isActive" = true AND "lastProbeOk" = true) AS probe_ok
FROM "Stream";
