/** Coerce migrate form/JSON/multipart flags. `"false"` must not stay on. */
export function migrateFlag(value: unknown, defaultOn: boolean): boolean {
  if (value === undefined || value === null) return defaultOn;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "false" || s === "0" || s === "off" || s === "no" || s === "") return false;
    if (s === "true" || s === "1" || s === "on" || s === "yes") return true;
  }
  return defaultOn;
}

export function normalizeMigrateApplyOptions(body: Record<string, unknown>) {
  return {
    dryRun: migrateFlag(body.dryRun, false),
    importBouquets: migrateFlag(body.importBouquets, true),
    importStreams: migrateFlag(body.importStreams, true),
    importLines: migrateFlag(body.importLines, true),
    importResellers: migrateFlag(body.importResellers, true),
    importMag: migrateFlag(body.importMag, true),
    importEnigma: migrateFlag(body.importEnigma, true),
    importCategories: migrateFlag(body.importCategories, true),
    importServers: migrateFlag(body.importServers, true),
    importEpg: migrateFlag(body.importEpg, true),
    importPackages: migrateFlag(body.importPackages, true),
    importProviders: migrateFlag(body.importProviders, true),
    importWatchFolders: migrateFlag(body.importWatchFolders, true),
    importTickets: migrateFlag(body.importTickets, true),
    importEpgGuide: migrateFlag(body.importEpgGuide, true),
    importBlockedAsns: migrateFlag(body.importBlockedAsns, true),
    importLogs: migrateFlag(body.importLogs, true),
    importStats: migrateFlag(body.importStats, true),
    importSettings: migrateFlag(body.importSettings, true),
    importExtras: migrateFlag(body.importExtras, true),
    skipExistingLines: migrateFlag(body.skipExistingLines, true),
    skipExistingStreams: migrateFlag(body.skipExistingStreams, true),
    clearDataBeforeImport: migrateFlag(body.clearDataBeforeImport, false),
    importStreamsStopped: migrateFlag(body.importStreamsStopped, false),
    importStreamsOnDemand: migrateFlag(body.importStreamsOnDemand, true),
    defaultServerId: typeof body.defaultServerId === "string" ? body.defaultServerId : null,
    ownerId: typeof body.ownerId === "string" ? body.ownerId : null,
  };
}

export function summarizeMigrateOptions(opts: Record<string, unknown>): string[] {
  return [
    `Skip existing lines: ${migrateFlag(opts.skipExistingLines, true) ? "on" : "off"}`,
    `Skip existing streams: ${migrateFlag(opts.skipExistingStreams, true) ? "on" : "off"}`,
    `Import resellers: ${migrateFlag(opts.importResellers, true) ? "on" : "off"}`,
    `Import servers: ${migrateFlag(opts.importServers, true) ? "on" : "off"}`,
    `Full EPG guide: ${migrateFlag(opts.importEpgGuide, true) ? "on" : "off"}`,
    `Clear data first: ${migrateFlag(opts.clearDataBeforeImport, false) ? "on" : "off"}`,
    `Import as on-demand: ${migrateFlag(opts.importStreamsOnDemand, true) ? "on" : "off"}`,
  ];
}
