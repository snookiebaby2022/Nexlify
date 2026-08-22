-- Reseller-owned custom bouquets (optional ownerUserId)
ALTER TABLE "Bouquet" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
CREATE INDEX IF NOT EXISTS "Bouquet_ownerUserId_idx" ON "Bouquet"("ownerUserId");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Bouquet_ownerUserId_fkey'
  ) THEN
    ALTER TABLE "Bouquet"
      ADD CONSTRAINT "Bouquet_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "PanelUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
