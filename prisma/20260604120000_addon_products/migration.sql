-- CreateTable
CREATE TABLE "AddonProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "whmcsProductId" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AddonEntitlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "whmcsServiceId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "panelLicenseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AddonEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AddonEntitlement_panelLicenseId_fkey" FOREIGN KEY ("panelLicenseId") REFERENCES "License" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AddonProduct_service_key" ON "AddonProduct"("service");
CREATE UNIQUE INDEX "AddonProduct_whmcsProductId_key" ON "AddonProduct"("whmcsProductId");
CREATE UNIQUE INDEX "AddonEntitlement_whmcsServiceId_key" ON "AddonEntitlement"("whmcsServiceId");
CREATE INDEX "AddonEntitlement_email_service_idx" ON "AddonEntitlement"("email", "service");
CREATE INDEX "AddonEntitlement_panelLicenseId_service_idx" ON "AddonEntitlement"("panelLicenseId", "service");
