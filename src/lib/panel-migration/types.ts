export type MigrationSource = "xui" | "onestream" | "xtream_ui" | "midnight" | "nexlify_json";

export type MigrationStreamRow = {
  legacyId: string;
  name: string;
  streamUrl: string;
  type?: "LIVE" | "MOVIE" | "SERIES";
  sortOrder?: number;
  streamIcon?: string;
  backupUrl?: string;
  categoryLegacyId?: string;
  categoryName?: string;
  epgChannelId?: string;
  channelId?: string;
  containerExtension?: string;
  isActive?: boolean;
  isAdult?: boolean;
  isRadio?: boolean;
  seriesName?: string;
  seasonNum?: number;
  episodeNum?: number;
  serverLegacyId?: string;
  notes?: string;
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
  isTrial?: boolean;
  isRestreamer?: boolean;
  allowedUserAgents?: string;
  disallowedUserAgents?: string;
  forcedServerLegacyId?: string;
};

export type MigrationResellerRow = {
  legacyId?: string;
  username: string;
  password: string;
  credits?: number;
  isActive?: boolean;
  email?: string;
  notes?: string;
  maxLines?: number;
  resellerDns?: string;
  parentLegacyId?: string;
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
  categoryType?: "LIVE" | "MOVIE" | "SERIES" | "RADIO";
  isAdult?: boolean;
  sortOrder?: number;
};

export type MigrationServerRow = {
  legacyId: string;
  name: string;
  host: string;
  port: number;
  protocol?: string;
  domain?: string;
  maxClients?: number;
  privateIp?: string;
};

export type MigrationEpgRow = {
  name: string;
  url: string;
  country?: string;
};

/** Billing/duration packages (distinct from channel bouquets when source has days/credits). */
export type MigrationPackageRow = {
  legacyId: string;
  name: string;
  days?: number;
  creditCost?: number;
  maxLines?: number;
  bouquetLegacyIds?: string[];
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type MigrationPhase2Data = {
  categories: MigrationCategoryRow[];
  servers: MigrationServerRow[];
  epgSources: MigrationEpgRow[];
  packages?: MigrationPackageRow[];
};

export type MigrationBundle = {
  source: MigrationSource;
  bouquets: MigrationBouquetRow[];
  streams: MigrationStreamRow[];
  lines: MigrationLineRow[];
  resellers?: MigrationResellerRow[];
  magDevices?: MigrationMagRow[];
  enigmaDevices?: MigrationEnigmaRow[];
  packages?: MigrationPackageRow[];
  phase2?: MigrationPhase2Data;
  /** Warnings from parsing (e.g., tables not found, malformed SQL). */
  warnings?: string[];
  /** Tables detected in the source dump — diagnostics for the Preview/Import report. */
  tablesFound?: { name: string; rows: number; hasColumns: boolean }[];
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
  importPackages?: boolean;
  skipExistingLines?: boolean;
  skipExistingStreams?: boolean;
  clearDataBeforeImport?: boolean;
  defaultServerId?: string | null;
  ownerId?: string | null;
  /** Transaction client — when provided, all DB calls use this instead of the global prisma. */
  tx?: { stream: any; bouquet: any; line: any; panelUser: any; magDevice: any; enigmaDevice: any; bouquetStream: any; category: any; streamServer: any; epgSource: any; [key: string]: any };
  /** Called periodically during import to report progress. */
  onProgress?: (phase: string, current: number, total: number) => void;
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
  packages: { imported: number; skipped: number };
  warnings: string[];
};
