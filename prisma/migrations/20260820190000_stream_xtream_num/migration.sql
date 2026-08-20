-- Add indexed Xtream numeric id for instant XCIPTV stream_id resolution
ALTER TABLE "Stream" ADD COLUMN IF NOT EXISTS "xtreamNum" INTEGER;

CREATE INDEX IF NOT EXISTS "Stream_xtreamNum_idx" ON "Stream"("xtreamNum");
