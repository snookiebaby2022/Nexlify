-- XUI feature pack: device lock, provider bouquet map, VOD symlinks
ALTER TABLE "Line" ADD COLUMN IF NOT EXISTS "lockMac" TEXT;
ALTER TABLE "Line" ADD COLUMN IF NOT EXISTS "lockDeviceId" TEXT;
ALTER TABLE "StreamProvider" ADD COLUMN IF NOT EXISTS "bouquetCategoryMap" JSONB;
ALTER TABLE "WatchFolder" ADD COLUMN IF NOT EXISTS "useSymlinks" BOOLEAN NOT NULL DEFAULT false;
