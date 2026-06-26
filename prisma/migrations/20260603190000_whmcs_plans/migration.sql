-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "maxServers" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Plan" ADD COLUMN "whmcsProductId" INTEGER;
ALTER TABLE "Plan" ADD COLUMN "badge" TEXT;
ALTER TABLE "Plan" ADD COLUMN "featuresJson" TEXT;

-- AlterTable
ALTER TABLE "License" ADD COLUMN "whmcsServiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "License_whmcsServiceId_key" ON "License"("whmcsServiceId");
