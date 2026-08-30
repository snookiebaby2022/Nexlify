-- Speed up ON DELETE SET NULL on Stream.parentStreamId (idempotent)
CREATE INDEX IF NOT EXISTS "Stream_parentStreamId_idx" ON "Stream"("parentStreamId");
