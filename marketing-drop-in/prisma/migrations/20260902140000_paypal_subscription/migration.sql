-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paypalSubscriptionId" TEXT;
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "paypalSubscriptionId" TEXT;
ALTER TABLE "License" ADD COLUMN IF NOT EXISTS "paypalSubscriptionStatus" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_paypalSubscriptionId_key" ON "Order"("paypalSubscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "License_paypalSubscriptionId_key" ON "License"("paypalSubscriptionId");
CREATE INDEX IF NOT EXISTS "License_paypalSubscriptionStatus_idx" ON "License"("paypalSubscriptionStatus");
