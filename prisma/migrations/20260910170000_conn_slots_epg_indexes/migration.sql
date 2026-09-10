-- Harden LiveConnection uniqueness + EPG/stream indexes for IPTV scale.
-- Deduplicate before adding unique (keep newest lastSeenAt).

UPDATE "LiveConnection" SET ip = '' WHERE ip IS NULL;

DELETE FROM "LiveConnection" a
USING "LiveConnection" b
WHERE a.id < b.id
  AND a."lineId" = b."lineId"
  AND a."streamId" IS NOT DISTINCT FROM b."streamId"
  AND a.ip = b.ip;

CREATE UNIQUE INDEX IF NOT EXISTS "LiveConnection_lineId_streamId_ip_key"
  ON "LiveConnection" ("lineId", "streamId", ip);

CREATE INDEX IF NOT EXISTS "Stream_epgChannelId_idx" ON "Stream" ("epgChannelId");

CREATE INDEX IF NOT EXISTS "EpgProgram_channelId_stop_idx" ON "EpgProgram" ("channelId", stop);

CREATE INDEX IF NOT EXISTS "EpgProgram_channelId_lower_start_idx"
  ON "EpgProgram" (lower("channelId"), start);
