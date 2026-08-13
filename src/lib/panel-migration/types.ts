export type MigrationSource =
  | "xui"
  | "onestream"
  | "xtream_ui"
  | "streamcreed"
  | "nxt"
  | "midnight"
  | "nexlify_json";

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
  legacyId?: string;
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

export type MigrationProviderRow = {
  legacyId: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  providerType?: string;
  notes?: string;
  isActive?: boolean;
};

export type MigrationProviderStreamLink = {
  providerLegacyId: string;
  streamLegacyId: string;
  providerPath?: string;
};

export type MigrationWatchFolderRow = {
  legacyId: string;
  name: string;
  path: string;
  type?: "MOVIE" | "SERIES" | "M3U" | "MIXED";
  categoryLegacyId?: string;
  serverLegacyId?: string;
  isActive?: boolean;
  isAdult?: boolean;
  autoScanMins?: number;
  lastScan?: Date;
  importedCount?: number;
};

export type MigrationWatchLogRow = {
  source: string;
  status?: string;
  imported?: number;
  skipped?: number;
  message?: string;
  watchFolderLegacyId?: string;
  createdAt?: Date;
};

export type MigrationTicketReplyRow = {
  body: string;
  authorLegacyId?: string;
  createdAt?: Date;
};

export type MigrationTicketRow = {
  legacyId: string;
  subject: string;
  body: string;
  status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  category?: "SUPPORT" | "SUGGESTION" | "REPORT" | "BUG" | "BILLING" | "GENERAL";
  createdByLegacyId?: string;
  assignedToLegacyId?: string;
  lineLegacyId?: string;
  createdAt?: Date;
  replies?: MigrationTicketReplyRow[];
};

export type MigrationEpgChannelRow = {
  sourceLegacyId?: string;
  channelId: string;
  name?: string;
  icon?: string;
};

export type MigrationEpgProgramRow = {
  sourceLegacyId?: string;
  channelId: string;
  title: string;
  description?: string;
  start: Date;
  stop: Date;
};

export type MigrationBlockedAsnRow = {
  asn: string;
  label?: string;
  reason?: string;
  isActive?: boolean;
};

export type MigrationActivityLogRow = {
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  createdAt?: Date;
};

export type MigrationBandwidthRow = {
  bytesIn?: number;
  bytesOut?: number;
  connections?: number;
  createdAt?: Date;
};

/** Extended XUI.one tables beyond core IPTV entities. */
export type MigrationPhase3Data = {
  providers: MigrationProviderRow[];
  providerStreamLinks: MigrationProviderStreamLink[];
  watchFolders: MigrationWatchFolderRow[];
  watchLogs: MigrationWatchLogRow[];
  tickets: MigrationTicketRow[];
  epgChannels: MigrationEpgChannelRow[];
  epgPrograms: MigrationEpgProgramRow[];
  blockedAsns: MigrationBlockedAsnRow[];
  activityLogs: MigrationActivityLogRow[];
  bandwidthSnapshots: MigrationBandwidthRow[];
  /** Raw settings row(s) stored under PanelSetting for operator review. */
  settingsRaw?: Record<string, unknown>;
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
  phase3?: MigrationPhase3Data;
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
  importProviders?: boolean;
  importWatchFolders?: boolean;
  importTickets?: boolean;
  importEpgGuide?: boolean;
  importBlockedAsns?: boolean;
  importLogs?: boolean;
  importStats?: boolean;
  importSettings?: boolean;
  skipExistingLines?: boolean;
  skipExistingStreams?: boolean;
  clearDataBeforeImport?: boolean;
  /**
   * When true (default), imported streams are created stopped — matches the
   * 1-stream Migration Guide behaviour so URLs can be verified before go-live.
   */
  importStreamsStopped?: boolean;
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
  providers: { imported: number; skipped: number };
  watchFolders: { imported: number; skipped: number };
  tickets: { imported: number; skipped: number };
  epgPrograms: { imported: number; skipped: number };
  blockedAsns: { imported: number; skipped: number };
  activityLogs: { imported: number; skipped: number };
  bandwidthSnapshots: { imported: number; skipped: number };
  settings: { imported: number; skipped: number };
  warnings: string[];
};
