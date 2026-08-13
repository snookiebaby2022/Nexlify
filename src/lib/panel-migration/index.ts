import type {
  MigrationApplyOptions,
  MigrationApplyResult,
  MigrationBundle,
  MigrationSource,
} from "./types";
import { applyMigrationBundle } from "./apply";
import { bundleFromJson, bundleFromSql } from "./map-rows";
import {
  bundleFromPostgres,
  probePostgresDatabase,
  type PostgresMigrationConfig,
  type PostgresProbeResult,
} from "./postgres";
import { MIGRATION_GUIDE_PATHS } from "./guide-paths";

export type { MigrationBundle, MigrationSource, MigrationApplyOptions, MigrationApplyResult };
export {
  MIGRATION_GUIDE_PATHS,
  guidePathFor,
  defaultDatabaseFor,
} from "./guide-paths";

/** Source dropdown — labels/hints/default DBs from the 1-stream Migration Guide paths. */
export const MIGRATION_SOURCES: {
  id: MigrationSource;
  label: string;
  hint: string;
  defaultDatabase?: string;
  engine: "mysql" | "postgres" | "json";
}[] = MIGRATION_GUIDE_PATHS.map((p) => ({
  id: p.id,
  label: p.label,
  hint: p.hint,
  defaultDatabase: p.defaultDatabase,
  engine: p.engine,
}));

export function parseMigrationInput(
  content: string,
  source: MigrationSource,
  format: "sql" | "json"
): MigrationBundle {
  if (format === "json") {
    const raw = JSON.parse(content) as unknown;
    return bundleFromJson(raw, source);
  }
  if (source === "nexlify_json") {
    throw new Error("Nexlify JSON source requires format=json");
  }
  return bundleFromSql(content, source);
}

export function previewMigrationBundle(bundle: MigrationBundle) {
  const live = bundle.streams.filter((s) => s.type === "LIVE" && !s.isRadio).length;
  const movies = bundle.streams.filter((s) => s.type === "MOVIE").length;
  const episodes = bundle.streams.filter(
    (s) => s.type === "SERIES" && (s.episodeNum != null || s.seasonNum != null)
  ).length;
  const seriesShows = new Set(
    bundle.streams
      .filter((s) => s.type === "SERIES" && s.seriesName)
      .map((s) => String(s.seriesName).toLowerCase())
  ).size;
  const seriesOnly = bundle.streams.filter(
    (s) => s.type === "SERIES" && s.episodeNum == null && s.seasonNum == null
  ).length;

  const phase3 = bundle.phase3;
  return {
    source: bundle.source,
    counts: {
      bouquets: bundle.bouquets.length,
      streams: bundle.streams.length,
      live,
      movies,
      series: seriesShows || seriesOnly,
      episodes,
      lines: bundle.lines.length,
      resellers: bundle.resellers?.length ?? 0,
      magDevices: bundle.magDevices?.length ?? 0,
      enigmaDevices: bundle.enigmaDevices?.length ?? 0,
      categories: bundle.phase2?.categories.length ?? 0,
      servers: bundle.phase2?.servers.length ?? 0,
      epgSources: bundle.phase2?.epgSources.length ?? 0,
      // Prefer top-level packages; phase2.packages is the same array when loaded from SQL.
      packages: (() => {
        const top = bundle.packages ?? [];
        const fromPhase2 = bundle.phase2?.packages ?? [];
        if (top.length && fromPhase2.length && top === fromPhase2) return top.length;
        if (top.length && fromPhase2.length) {
          const ids = new Set(top.map((p) => String(p.legacyId)));
          let extra = 0;
          for (const p of fromPhase2) {
            if (!ids.has(String(p.legacyId))) extra++;
          }
          return top.length + extra;
        }
        return top.length || fromPhase2.length;
      })(),
      accessCodes: phase3?.accessCodes?.length ?? 0,
      blockedUserAgents: phase3?.blockedUserAgents?.length ?? 0,
      userGroups: phase3?.userGroups?.length ?? 0,
      liveConnections: phase3?.liveConnections?.length ?? 0,
      onDemandStreams: phase3?.onDemandStreamLegacyIds?.length ?? 0,
      watchCategories: phase3?.watchCategories?.length ?? 0,
      watchRefresh: phase3?.watchRefresh?.length ?? 0,
      epgApi: phase3?.epgApiChannels?.length ?? 0,
      epgLanguages: phase3?.epgLanguages?.length ?? 0,
      crontab: phase3?.crontab?.length ?? 0,
      profiles: phase3?.profiles?.length ?? 0,
      creditLogs: phase3?.creditLogs?.length ?? 0,
      providers: phase3?.providers.length ?? 0,
      providerLinks: phase3?.providerStreamLinks.length ?? 0,
      watchFolders: phase3?.watchFolders.length ?? 0,
      watchLogs: phase3?.watchLogs.length ?? 0,
      tickets: phase3?.tickets.length ?? 0,
      epgChannels: phase3?.epgChannels.length ?? 0,
      epgPrograms: phase3?.epgPrograms.length ?? 0,
      blockedAsns: phase3?.blockedAsns.length ?? 0,
      activityLogs: phase3?.activityLogs.length ?? 0,
      bandwidthSnapshots: phase3?.bandwidthSnapshots.length ?? 0,
      settings: phase3?.settingsRaw ? 1 : 0,
    },
    warnings: bundle.warnings ?? [],
    tablesFound: bundle.tablesFound ?? [],
  };
}

export type { PostgresMigrationConfig, PostgresProbeResult };

export async function probeMigrationPostgres(
  config: PostgresMigrationConfig
): Promise<PostgresProbeResult> {
  return probePostgresDatabase(config);
}

export async function runMigration(
  content: string,
  source: MigrationSource,
  format: "sql" | "json",
  options: MigrationApplyOptions & { dryRun?: boolean }
): Promise<{
  bundle: MigrationBundle;
  preview: ReturnType<typeof previewMigrationBundle>;
  result?: MigrationApplyResult;
}> {
  const bundle = parseMigrationInput(content, source, format);
  const preview = previewMigrationBundle(bundle);
  if (options.dryRun) return { bundle, preview };
  const result = await applyMigrationBundle(bundle, options);
  return { bundle, preview, result };
}

export type MigrationApplyOptionsExtended = MigrationApplyOptions & {
  dryRun?: boolean;
  importCategories?: boolean;
  importServers?: boolean;
  importEpg?: boolean;
};

export async function runMigrationFromPostgres(
  pg: PostgresMigrationConfig,
  source: MigrationSource,
  options: MigrationApplyOptionsExtended
): Promise<{
  bundle: MigrationBundle;
  preview: ReturnType<typeof previewMigrationBundle>;
  probe: PostgresProbeResult;
  result?: MigrationApplyResult;
}> {
  const { bundle, probe } = await bundleFromPostgres(pg, source);
  const preview = previewMigrationBundle(bundle);
  if (options.dryRun) return { bundle, preview, probe };
  const result = await applyMigrationBundle(bundle, options);
  return { bundle, preview, probe, result };
}
