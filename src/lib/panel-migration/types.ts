export type MigrationSource = "xui" | "onestream" | "xtream_ui" | "midnight" | "nexlify_json";

export type MigrationStreamRow = {
  legacyId: string;
  name: string;
  streamUrl: string;
  type?: "LIVE" | "MOVIE" | "SERIES";
  streamIcon?: string;
  categoryLegacyId?: string;
  categoryName?: string;
  epgChannelId?: string;
  channelId?: string;
  containerExtension?: string;
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
  canWatchAdult?: boolean;
  allowedCountries?: string;
  blockedCountries?: string;
  allowedOutput?: string;
  ownerLegacyId?: string;
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

export type MigrationEnigmaRow = {
  mac: string;
  lineUsername: string;
  model?: string;
};

export type MigrationCategoryRow = {
  legacyId: string;
  name: string;
  parentLegacyId?: string;
};

export type MigrationServerRow = {
  legacyId: string;
  name: string;
  host: string;
  port: number;
  protocol?: string;
};

export type MigrationEpgRow = {
  name: string;
  url: string;
  country?: string;
};

export type MigrationPhase2Data = {
  categories: MigrationCategoryRow[];
  servers: MigrationServerRow[];
  epgSources: MigrationEpgRow[];
};

export type MigrationBundle = {
  source: MigrationSource;
  bouquets: MigrationBouquetRow[];
  streams: MigrationStreamRow[];
  lines: MigrationLineRow[];
  resellers?: MigrationResellerRow[];
  magDevices?: MigrationMagRow[];
  enigmaDevices?: MigrationEnigmaRow[];
  phase2?: MigrationPhase2Data;
};

export type MigrationApplyOptions = {
  importBouquets?: boolean;
  importStreams?: boolean;
  importLines?: boolean;
  importResellers?: boolean;
  importMag?: boolean;
  importEnigma?: boolean;
  importCategories?: boolean;
  importServers?: boolean;
  importEpg?: boolean;
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
  enigmaDevices: { imported: number; skipped: number };
  categories: { imported: number; skipped: number };
  servers: { imported: number; skipped: number };
  epgSources: { imported: number; skipped: number };
  warnings: string[];
};
