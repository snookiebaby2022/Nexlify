SELECT
  COUNT(*) FILTER (WHERE "isActive" = false) AS inactive,
  COUNT(*) FILTER (WHERE type = 'LIVE' AND "isActive" = true AND "lastProbeOk" = false AND ("backupUrl" IS NULL OR "backupUrl" = '')) AS dead,
  COUNT(*) FILTER (WHERE type = 'LIVE' AND "isActive" = true AND "lastProbeOk" = false AND "backupUrl" IS NOT NULL AND "backupUrl" <> '') AS unstable,
  COUNT(*) FILTER (WHERE type = 'LIVE' AND "isActive" = true AND "lastProbeOk" = false) AS failed_source,
  COUNT(*) FILTER (WHERE type = 'LIVE' AND "isActive" = true AND "lastProbeOk" IS NULL) AS never_probed,
  COUNT(*) FILTER (WHERE type = 'LIVE' AND "isActive" = true AND "lastProbeOk" = true) AS probe_ok,
  COUNT(*) FILTER (WHERE "isActive" = false AND type = 'LIVE') AS inactive_live,
  COUNT(*) FILTER (WHERE "isActive" = false AND type = 'MOVIE') AS inactive_movie,
  COUNT(*) FILTER (WHERE "isActive" = false AND type = 'SERIES') AS inactive_series,
  COUNT(*) AS total
FROM "Stream";
