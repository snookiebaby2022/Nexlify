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
  return {
    source: bundle.source,
    counts: {
      bouquets: bundle.bouquets.length,
      streams: bundle.streams.length,
      lines: bundle.lines.length,
      resellers: bundle.resellers?.length ?? 0,
      magDevices: bundle.magDevices?.length ?? 0,
      enigmaDevices: bundle.enigmaDevices?.length ?? 0,
      categories: bundle.phase2?.categories.length ?? 0,
      servers: bundle.phase2?.servers.length ?? 0,
      epgSources: bundle.phase2?.epgSources.length ?? 0,
      packages:
        (bundle.packages?.length ?? 0) + (bundle.phase2?.packages?.length ?? 0),
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
