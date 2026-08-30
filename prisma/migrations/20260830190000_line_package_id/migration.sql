-- Persist the package used to create/renew a line so edit can show it.
ALTER TABLE "Line" ADD COLUMN IF NOT EXISTS "packageId" TEXT;

CREATE INDEX IF NOT EXISTS "Line_packageId_idx" ON "Line"("packageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Line_packageId_fkey'
  ) THEN
    ALTER TABLE "Line"
      ADD CONSTRAINT "Line_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "Package"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
