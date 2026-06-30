-- Admin panel schema additions (SQLite). Safe to re-run (ignored if column exists).
ALTER TABLE User ADD COLUMN trialBypass BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE User ADD COLUMN utmSource TEXT;
ALTER TABLE User ADD COLUMN utmMedium TEXT;
ALTER TABLE User ADD COLUMN utmCampaign TEXT;
ALTER TABLE "Order" ADD COLUMN utmSource TEXT;
ALTER TABLE "Order" ADD COLUMN utmMedium TEXT;
ALTER TABLE "Order" ADD COLUMN utmCampaign TEXT;
