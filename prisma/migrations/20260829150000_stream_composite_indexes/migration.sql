-- Composite Stream indexes for catalog / playback queries (idempotent)
CREATE INDEX IF NOT EXISTS "Stream_type_isActive_categoryId_idx" ON "Stream"("type", "isActive", "categoryId");
CREATE INDEX IF NOT EXISTS "Stream_serverId_type_isActive_idx" ON "Stream"("serverId", "type", "isActive");
CREATE INDEX IF NOT EXISTS "Stream_streamUrl_type_idx" ON "Stream"("streamUrl", "type");
