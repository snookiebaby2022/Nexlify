ALTER TABLE "StreamServer" ADD COLUMN IF NOT EXISTS "agentSshPasswordEnc" TEXT;
ALTER TABLE "StreamServer" ADD COLUMN IF NOT EXISTS "countryCode" TEXT;
