import type { MigrationSource, MigrationBundle } from "./types";
import {
  buildMigrationBundle,
  pgRowsToTableData,
  type MigrationTableSet,
} from "./map-rows";
import type { SqlTableData } from "./sql-parse";
import type { MigrationPhase2Data } from "./phase2";

export type PostgresMigrationConfig = {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  /** Limit to one schema; default scans all non-system schemas */
  schema?: string;
  /** Qualified table overrides: schema.table or table */
  tables?: Partial<{
    streams: string;
    bouquets: string;
    lines: string;
    resellers: string;
    mag: string;
    bouquetStreams: string;
    lineBouquets: string;
  }>;
};

export type PgTableRef = { schema: string; table: string; columns: string[]; rowCount: number };

const SKIP_TABLE = /(_log|_logs|audit|migration|session|token|cache|job|queue|history)/i;

const TABLE_SCORES: Record<
  "streams" | "bouquets" | "lines" | "resellers" | "mag" | "bouquetStreams" | "lineBouquets",
  { patterns: RegExp[]; penalty?: RegExp }
> = {
  streams: {
    patterns: [/^streams?$/i, /^media_streams?$/i, /^live_streams?$/i, /^channels?$/i],
    penalty: /epg|category|server|provider|log/i,
  },
  bouquets: {
    patterns: [/^bouquets?$/i, /^packages?$/i, /^bundles?$/i],
    penalty: /log|line|user/i,
  },
  lines: {
    patterns: [/^subscriptions?$/i, /^lines?$/i, /^clients?$/i, /^subscribers?$/i],
    penalty: /log|credit|transaction/i,
  },
  resellers: {
    patterns: [/^users?$/i, /^resellers?$/i, /^reg_users?$/i, /^sellers?$/i],
    penalty: /log|line|subscription|client/i,
  },
  mag: {
    patterns: [/^mag_devices?$/i, /^mag$/i, /^stb_devices?$/i, /^devices?$/i],
    penalty: /enigma|log/i,
  },
  bouquetStreams: {
    patterns: [
      /^bouquet_streams?$/i,
      /^package_streams?$/i,
      /^package_channels?$/i,
      /^bouquet_channels?$/i,
    ],
  },
  lineBouquets: {
    patterns: [
      /^line_bouquets?$/i,
      /^subscription_packages?$/i,
      /^line_packages?$/i,
      /^subscription_bouquets?$/i,
    ],
  },
};

export type PgMappingKind = keyof typeof TABLE_SCORES;

export type PostgresProbeResult = {
  ok: boolean;
  schemas: string[];
  tables: { schema: string; name: string; rowCount: number }[];
  mapping: Partial<Record<PgMappingKind, PgTableRef>>;
  message?: string;
};

function scoreTable(name: string, kind: keyof typeof TABLE_SCORES): number {
  const cfg = TABLE_SCORES[kind];
  let score = 0;
  for (const p of cfg.patterns) {
    if (p.test(name)) score += 100;
  }
  if (cfg.penalty?.test(name)) score -= 50;
  if (SKIP_TABLE.test(name)) score -= 200;
  return score;
}

function parseQualified(ref: string, defaultSchema: string) {
  const parts = ref.split(".").filter(Boolean);
  if (parts.length >= 2) {
    return { schema: parts[0], table: parts[parts.length - 1] };
  }
  return { schema: defaultSchema, table: parts[0] };
}

async function getClient(config: PostgresMigrationConfig) {
  const pg = await import("pg");
  const { Client } = pg.default ?? pg;
  const client = config.connectionString
    ? new Client({
        connectionString: config.connectionString,
        connectionTimeoutMillis: 12_000,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      })
    : new Client({
        host: config.host ?? "127.0.0.1",
        port: config.port ?? 5432,
        database: config.database,
        user: config.user,
        password: config.password,
        connectionTimeoutMillis: 12_000,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      });
  await client.connect();
  return client;
}

export async function probePostgresDatabase(
  config: PostgresMigrationConfig
): Promise<PostgresProbeResult> {
  const client = await getClient(config);
  try {
    const schemaFilter = config.schema?.trim();
    const tablesRes = await client.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema')
         ${schemaFilter ? "AND table_schema = $1" : ""}
       ORDER BY table_schema, table_name`,
      schemaFilter ? [schemaFilter] : []
    );

    const schemas = [...new Set(tablesRes.rows.map((r) => r.table_schema))];
    const tables: PostgresProbeResult["tables"] = [];

    for (const row of tablesRes.rows) {
      if (SKIP_TABLE.test(row.table_name)) continue;
      try {
        const q = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM "${row.table_schema}"."${row.table_name}"`
        );
        tables.push({
          schema: row.table_schema,
          name: row.table_name,
          rowCount: Number(q.rows[0]?.c ?? 0),
        });
      } catch {
        tables.push({ schema: row.table_schema, name: row.table_name, rowCount: -1 });
      }
    }

    const defaultSchema = schemaFilter ?? schemas[0] ?? "public";
    const mapping: PostgresProbeResult["mapping"] = {};
    const overrides = config.tables ?? {};

    for (const kind of Object.keys(TABLE_SCORES) as (keyof typeof TABLE_SCORES)[]) {
      const override = overrides[kind as keyof typeof overrides];
      if (override) {
        const { schema, table } = parseQualified(override, defaultSchema);
        const cols = await loadColumns(client, schema, table);
        const count = tables.find((t) => t.schema === schema && t.name === table)?.rowCount ?? 0;
        mapping[kind] = { schema, table, columns: cols, rowCount: count };
        continue;
      }
      let best: { schema: string; name: string; score: number } | null = null;
      for (const t of tables) {
        const s = scoreTable(t.name, kind);
        if (s <= 0) continue;
        if (!best || s > best.score) best = { schema: t.schema, name: t.name, score: s };
      }
      if (best) {
        const cols = await loadColumns(client, best.schema, best.name);
        const count = tables.find((x) => x.schema === best!.schema && x.name === best!.name)?.rowCount ?? 0;
        mapping[kind] = { schema: best.schema, table: best.name, columns: cols, rowCount: count };
      }
    }

    return { ok: true, schemas, tables, mapping };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function loadColumns(
  client: import("pg").Client,
  schema: string,
  table: string
): Promise<string[]> {
  const res = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table]
  );
  return res.rows.map((r) => r.column_name.toLowerCase());
}

async function fetchTable(
  client: import("pg").Client,
  schema: string,
  table: string
): Promise<Record<string, unknown>[]> {
  const res = await client.query(`SELECT * FROM "${schema}"."${table}"`);
  return res.rows as Record<string, unknown>[];
}

function enrichBouquetsFromJunction(
  bouquets: SqlTableData | null,
  junction: Record<string, unknown>[] | null,
  bouquetIdCol: string,
  streamIdCol: string
) {
  if (!bouquets || !junction?.length) return bouquets;
  const byBouquet = new Map<string, string[]>();
  for (const row of junction) {
    const bid = String(row[bouquetIdCol] ?? row.package_id ?? row.bouquet_id ?? "");
    const sid = String(row[streamIdCol] ?? row.stream_id ?? row.channel_id ?? "");
    if (!bid || !sid) continue;
    const list = byBouquet.get(bid) ?? [];
    list.push(sid);
    byBouquet.set(bid, list);
  }
  const idIdx = bouquets.columns.findIndex((c) => c === "id");
  let channelsIdx = bouquets.columns.findIndex((c) =>
    ["bouquet_channels", "bouquet_streams", "channels", "stream_ids", "streams"].includes(c)
  );
  if (channelsIdx < 0) {
    bouquets.columns.push("bouquet_channels");
    channelsIdx = bouquets.columns.length - 1;
    for (const row of bouquets.rows) row.push(null);
  }
  for (const row of bouquets.rows) {
    const id = idIdx >= 0 ? String(row[idIdx]) : "";
    const extra = byBouquet.get(id);
    if (!extra?.length) continue;
    row[channelsIdx] = JSON.stringify([...idsFromJunctionValue(row[channelsIdx]), ...extra]);
  }
  return bouquets;
}

function idsFromJunctionValue(val: unknown): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val.map(String);
  try {
    const p = JSON.parse(String(val));
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return String(val)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
}

function detectJunctionCols(columns: string[]) {
  const bouquetCol =
    columns.find((c) => /bouquet|package|bundle/i.test(c) && /id/i.test(c)) ??
    columns.find((c) => c === "bouquet_id" || c === "package_id") ??
    "bouquet_id";
  const streamCol =
    columns.find((c) => /stream|channel|media/i.test(c) && /id/i.test(c)) ??
    columns.find((c) => c === "stream_id" || c === "channel_id") ??
    "stream_id";
  return { bouquetCol, streamCol };
}

export async function bundleFromPostgres(
  config: PostgresMigrationConfig,
  source: MigrationSource = "onestream"
): Promise<{ bundle: MigrationBundle; probe: PostgresProbeResult; phase2: MigrationPhase2Data }> {
  const probe = await probePostgresDatabase(config);
  const client = await getClient(config);
  try {
    const mapping = probe.mapping;
    const load = async (kind: keyof typeof TABLE_SCORES) => {
      const ref = mapping[kind];
      if (!ref) return null;
      const rows = await fetchTable(client, ref.schema, ref.table);
      return pgRowsToTableData(rows);
    };

    let bouquets = await load("bouquets");
    const junctionRef = mapping.bouquetStreams;
    if (junctionRef) {
      const junctionRows = await fetchTable(client, junctionRef.schema, junctionRef.table);
      const { bouquetCol, streamCol } = detectJunctionCols(junctionRef.columns);
      bouquets = enrichBouquetsFromJunction(bouquets, junctionRows, bouquetCol, streamCol);
    }

    const linesRef = mapping.lines;
    const resellersRef = mapping.resellers;
    const resellersSameAsLines =
      linesRef &&
      resellersRef &&
      linesRef.schema === resellersRef.schema &&
      linesRef.table === resellersRef.table;

    const tables: MigrationTableSet = {
      streams: await load("streams"),
      bouquets,
      lines: await load("lines"),
      resellers: resellersSameAsLines ? null : await load("resellers"),
      mag: await load("mag"),
    };

    const bundle = buildMigrationBundle(tables, source);

    const defaultSchema =
      config.schema?.trim() ||
      probe.mapping.streams?.schema ||
      probe.schemas[0] ||
      "public";
    const { loadPhase2FromPg } = await import("./phase2");
    const phase2 = await loadPhase2FromPg(
      client,
      probe.tables.map((t) => ({ schema: t.schema, name: t.name })),
      defaultSchema,
      (schema, table) => fetchTable(client, schema, table),
      bundle.streams.map((s) => ({ legacyId: s.legacyId, type: s.type }))
    );

    return { bundle, probe, phase2 };
  } finally {
    await client.end().catch(() => undefined);
  }
}
