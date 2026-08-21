-- Per-package visibility for reseller hierarchy.
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "allowResellers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "allowSubResellers" BOOLEAN NOT NULL DEFAULT true;
