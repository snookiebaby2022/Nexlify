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
import { applyMigrationPhase2, type MigrationPhase2Data } from "./phase2";

export type { MigrationBundle, MigrationSource, MigrationApplyOptions, MigrationApplyResult };

export const MIGRATION_SOURCES: {
  id: MigrationSource;
  label: string;
  hint: string;
}[] = [
  {
    id: "xui",
    label: "XUI.one",
    hint: "MySQL backup (.sql) from XUI — imports lines, bouquets, streams, MAG, resellers when present.",
  },
  {
    id: "onestream",
    label: "1-stream",
    hint: "Live PostgreSQL connection (recommended) or SQL/JSON export. Auto-detects subscriptions, packages, streams, MAG.",
  },
  {
    id: "xtream_ui",
    label: "Xtream UI",
    hint: "Legacy Xtream Codes UI SQL dump (users/lines, streams, bouquets tables).",
  },
  {
    id: "midnight",
    label: "Midnight Streamers",
    hint: "SQL dump or JSON bundle (streams, bouquets, lines/subscribers).",
  },
  {
    id: "nexlify_json",
    label: "Nexlify JSON",
    hint: "Universal JSON format for manual exports or scripts.",
  },
];

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
    },
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
  phase2?: MigrationPhase2Data;
  result?: MigrationApplyResult;
  phase2Result?: Awaited<ReturnType<typeof applyMigrationPhase2>>;
}> {
  const { bundle, probe, phase2 } = await bundleFromPostgres(pg, source);
  const preview = previewMigrationBundle(bundle);
  if (options.dryRun) return { bundle, preview, probe, phase2 };
  const result = await applyMigrationBundle(bundle, options);
  const phase2Result = phase2
    ? await applyMigrationPhase2(phase2, {
        importCategories: options.importCategories !== false,
        importServers: options.importServers !== false,
        importEpg: options.importEpg !== false,
        skipExisting: options.skipExistingStreams !== false,
      })
    : undefined;
  return { bundle, preview, probe, phase2, result, phase2Result };
}
