-- Staff RBAC: fine-grained permissions on panel users (schema had column without migration).
ALTER TABLE "PanelUser" ADD COLUMN IF NOT EXISTS "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
