-- CreateEnum
CREATE TYPE "PanelNotificationKind" AS ENUM ('UPDATE', 'MESSAGE', 'ALERT');

-- CreateEnum
CREATE TYPE "PanelNotificationPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PanelNotificationTarget" AS ENUM ('ALL_RESELLERS', 'SPECIFIC_USER');

-- CreateTable
CREATE TABLE "PanelNotification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" "PanelNotificationKind" NOT NULL,
    "priority" "PanelNotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "target" "PanelNotificationTarget" NOT NULL,
    "recipientId" TEXT,
    "createdById" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelNotificationRead" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelNotificationRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PanelNotification_isActive_createdAt_idx" ON "PanelNotification"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "PanelNotification_target_recipientId_idx" ON "PanelNotification"("target", "recipientId");

-- CreateIndex
CREATE INDEX "PanelNotificationRead_userId_idx" ON "PanelNotificationRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PanelNotificationRead_notificationId_userId_key" ON "PanelNotificationRead"("notificationId", "userId");

-- AddForeignKey
ALTER TABLE "PanelNotification" ADD CONSTRAINT "PanelNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "PanelUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelNotification" ADD CONSTRAINT "PanelNotification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "PanelUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelNotificationRead" ADD CONSTRAINT "PanelNotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "PanelNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelNotificationRead" ADD CONSTRAINT "PanelNotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PanelUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
