-- Safe for DBs where WatchFolder was never created (partial/baseline-skew installs).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WatchFolderType') THEN
    CREATE TYPE "WatchFolderType" AS ENUM ('MOVIE', 'SERIES', 'M3U', 'MIXED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "WatchFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "type" "WatchFolderType" NOT NULL DEFAULT 'MIXED',
    "categoryId" TEXT,
    "serverId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAdult" BOOLEAN NOT NULL DEFAULT false,
    "autoScanMins" INTEGER NOT NULL DEFAULT 0,
    "lastScan" TIMESTAMP(3),
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchFolder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WatchFolder" ADD COLUMN IF NOT EXISTS "isAdult" BOOLEAN NOT NULL DEFAULT false;
