-- Stream health signals used by edge splice + viewer failure tracking (schema drift fix).

ALTER TABLE "Stream" ADD COLUMN IF NOT EXISTS "lastSpliceAt" TIMESTAMP(3);
ALTER TABLE "Stream" ADD COLUMN IF NOT EXISTS "lastSpliceOk" BOOLEAN;
ALTER TABLE "Stream" ADD COLUMN IF NOT EXISTS "lastSpliceError" TEXT;
ALTER TABLE "Stream" ADD COLUMN IF NOT EXISTS "lastViewerFailAt" TIMESTAMP(3);
ALTER TABLE "Stream" ADD COLUMN IF NOT EXISTS "lastViewerError" TEXT;
