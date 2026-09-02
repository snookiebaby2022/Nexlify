-- Stream listing order indexes for bouquet catalog keyset pagination (idempotent)
CREATE INDEX IF NOT EXISTS "Stream_type_isActive_sortOrder_name_id_idx" ON "Stream"("type", "isActive", "sortOrder", "name", "id");
CREATE INDEX IF NOT EXISTS "Stream_type_isActive_updatedAt_id_idx" ON "Stream"("type", "isActive", "updatedAt", "id");
