-- Ordered streaming-server pool (first = primary). Idempotent.
ALTER TABLE "Stream" ADD COLUMN IF NOT EXISTS "serverPoolIds" JSONB;
ALTER TABLE "WatchFolder" ADD COLUMN IF NOT EXISTS "serverPoolIds" JSONB;
ALTER TABLE "M3uSyncJob" ADD COLUMN IF NOT EXISTS "serverPoolIds" JSONB;

UPDATE "Stream"
SET "serverPoolIds" = jsonb_build_array("serverId")
WHERE "serverId" IS NOT NULL
  AND ("serverPoolIds" IS NULL OR "serverPoolIds" = 'null'::jsonb);

UPDATE "WatchFolder"
SET "serverPoolIds" = jsonb_build_array("serverId")
WHERE "serverId" IS NOT NULL
  AND ("serverPoolIds" IS NULL OR "serverPoolIds" = 'null'::jsonb);

UPDATE "M3uSyncJob"
SET "serverPoolIds" = jsonb_build_array("serverId")
WHERE "serverId" IS NOT NULL
  AND ("serverPoolIds" IS NULL OR "serverPoolIds" = 'null'::jsonb);
