-- Add LIVE watch-folder type for remote M3U live channel auto-sync.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WatchFolderType') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'WatchFolderType' AND e.enumlabel = 'LIVE'
    ) THEN
      ALTER TYPE "WatchFolderType" ADD VALUE 'LIVE';
    END IF;
  END IF;
END $$;
