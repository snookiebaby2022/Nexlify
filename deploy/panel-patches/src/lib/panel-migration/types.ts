export type MigrationSource = "xui" | "onestream" | "xtream_ui" | "midnight" | "nexlify_json";

export type MigrationStreamRow = {
  legacyId: string;
  name: string;
  streamUrl: string;
  type?: "LIVE" | "MOVIE" | "SERIES";
  streamIcon?: string;
  categoryName?: string;
  isActive?: boolean;
};

export type MigrationBouquetRow = {
  legacyId: string;
  name: string;
  streamLegacyIds: string[];
  sortOrder?: number;
};

export type MigrationLineRow = {
  legacyId?: string;
  username: string;
  password: string;
  expiresAt: Date;
  maxConnections?: number;
  status?: "ACTIVE" | "DISABLED" | "BANNED" | "EXPIRED";
  bouquetLegacyIds?: string[];
  notes?: string;
  allowedIps?: string;
  lockToIp?: boolean;
};

export type MigrationResellerRow = {
  legacyId?: string;
  username: string;
  password: string;
  credits?: number;
  isActive?: boolean;
};

export type MigrationMagRow = {
  mac: string;
  lineUsername: string;
  model?: string;
};

export type MigrationBundle = {
  source: MigrationSource;
  bouquets: MigrationBouquetRow[];
  streams: MigrationStreamRow[];
  lines: MigrationLineRow[];
  resellers?: MigrationResellerRow[];
  magDevices?: MigrationMagRow[];
};

export type MigrationApplyOptions = {
  importBouquets?: boolean;
  importStreams?: boolean;
  importLines?: boolean;
  importResellers?: boolean;
  importMag?: boolean;
  skipExistingLines?: boolean;
  skipExistingStreams?: boolean;
  defaultServerId?: string | null;
  ownerId?: string | null;
};

export type MigrationApplyResult = {
  bouquets: { imported: number; skipped: number };
  streams: { imported: number; skipped: number };
  lines: { imported: number; skipped: number };
  resellers: { imported: number; skipped: number };
  magDevices: { imported: number; skipped: number };
  warnings: string[];
};
