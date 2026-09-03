-- Watch folder bouquet attach options (idempotent)
ALTER TABLE "WatchFolder" ADD COLUMN IF NOT EXISTS "autoBouquet" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WatchFolder" ADD COLUMN IF NOT EXISTS "bouquetIds" TEXT NOT NULL DEFAULT '';
