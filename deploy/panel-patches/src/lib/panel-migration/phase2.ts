import { prisma } from "@/lib/prisma";
import { pgRowsToTableData } from "./map-rows";
import { rowToRecord, type SqlTableData } from "./sql-parse";

export type MigrationCategoryRow = { legacyId: string; name: string; parentLegacyId?: string };
export type MigrationServerRow = {
  legacyId: string;
  name: string;
  host: string;
  port: number;
  protocol?: string;
};
export type MigrationEpgRow = { name: string; url: string; country?: string };

export type MigrationPhase2Data = {
  categories: MigrationCategoryRow[];
  servers: MigrationServerRow[];
  epgSources: MigrationEpgRow[];
  vodStreams: { legacyId: string; name: string; streamUrl: string; type: "MOVIE" | "SERIES" }[];
};

const PHASE2_TABLE_SCORES = {
  categories: { patterns: [/^categories?$/i, /^stream_categories?$/i], penalty: /log/i },
  servers: {
    patterns: [/^streaming_servers?$/i, /^servers?$/i, /^stream_servers?$/i],
    penalty: /log|panel/i,
  },
  epg: { patterns: [/^epg_sources?$/i, /^epg$/i], penalty: /program|data/i },
} as const;

function scoreTable(name: string, kind: keyof typeof PHASE2_TABLE_SCORES): number {
  const cfg = PHASE2_TABLE_SCORES[kind];
  let s = 0;
  for (const p of cfg.patterns) if (p.test(name)) s += 100;
  if ("penalty" in cfg && cfg.penalty?.test(name)) s -= 50;
  return s;
}

export function mapCategories(data: SqlTableData | null): MigrationCategoryRow[] {
  if (!data) return [];
  const out: MigrationCategoryRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const legacyId = String(r.id ?? "");
    if (!legacyId) continue;
    out.push({
      legacyId,
      name: String(r.category_name ?? r.name ?? `Category ${legacyId}`),
      parentLegacyId: r.parent_id != null ? String(r.parent_id) : undefined,
    });
  }
  return out;
}

export function mapServers(data: SqlTableData | null): MigrationServerRow[] {
  if (!data) return [];
  const out: MigrationServerRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const legacyId = String(r.id ?? "");
    const host = String(r.server_ip ?? r.host ?? r.ip ?? "").trim();
    if (!legacyId || !host) continue;
    out.push({
      legacyId,
      name: String(r.server_name ?? r.name ?? host),
      host,
      port: Number(r.port ?? r.http_port ?? 80) || 80,
      protocol: String(r.protocol ?? "http"),
    });
  }
  return out;
}

export function mapEpgSources(data: SqlTableData | null): MigrationEpgRow[] {
  if (!data) return [];
  const out: MigrationEpgRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const url = String(r.url ?? r.epg_url ?? r.xmltv_url ?? "").trim();
    if (!url) continue;
    out.push({
      name: String(r.name ?? r.epg_name ?? "EPG"),
      url,
      country: r.country ? String(r.country) : undefined,
    });
  }
  return out;
}

export function pickPhase2Table(
  tables: { schema: string; name: string }[],
  kind: keyof typeof PHASE2_TABLE_SCORES
): string | null {
  let best: { name: string; score: number } | null = null;
  for (const t of tables) {
    const s = scoreTable(t.name, kind);
    if (s <= 0) continue;
    if (!best || s > best.score) best = { name: t.name, score: s };
  }
  return best?.name ?? null;
}

export async function loadPhase2FromPg(
  client: import("pg").Client,
  tables: { schema: string; name: string }[],
  schema: string,
  fetchTable: (schema: string, table: string) => Promise<Record<string, unknown>[]>,
  existingStreams: { legacyId: string; type?: string }[]
): Promise<MigrationPhase2Data> {
  const load = async (kind: keyof typeof PHASE2_TABLE_SCORES) => {
    const name = pickPhase2Table(tables, kind);
    if (!name) return null;
    return pgRowsToTableData(await fetchTable(schema, name));
  };

  const vodStreams = existingStreams
    .filter((s) => s.type === "MOVIE" || s.type === "SERIES")
    .map((s) => ({
      legacyId: s.legacyId,
      name: "",
      streamUrl: "",
      type: s.type as "MOVIE" | "SERIES",
    }));

  return {
    categories: mapCategories(await load("categories")),
    servers: mapServers(await load("servers")),
    epgSources: mapEpgSources(await load("epg")),
    vodStreams,
  };
}

export async function applyMigrationPhase2(
  data: MigrationPhase2Data,
  opts: {
    importCategories?: boolean;
    importServers?: boolean;
    importEpg?: boolean;
    skipExisting?: boolean;
  }
) {
  const result = {
    categories: { imported: 0, skipped: 0 },
    servers: { imported: 0, skipped: 0 },
    epgSources: { imported: 0, skipped: 0 },
  };
  const catMap = new Map<string, string>();

  if (opts.importCategories !== false) {
    for (const c of data.categories) {
      const dup = await prisma.category.findFirst({ where: { name: c.name } });
      if (dup) {
        catMap.set(c.legacyId, dup.id);
        result.categories.skipped++;
        continue;
      }
      const created = await prisma.category.create({
        data: { name: c.name },
      });
      catMap.set(c.legacyId, created.id);
      result.categories.imported++;
    }
  }

  if (opts.importServers !== false) {
    for (const s of data.servers) {
      if (opts.skipExisting) {
        const dup = await prisma.streamServer.findFirst({ where: { host: s.host } });
        if (dup) {
          result.servers.skipped++;
          continue;
        }
      }
      await prisma.streamServer.create({
        data: {
          name: s.name,
          host: s.host,
          port: s.port,
          protocol: s.protocol ?? "http",
        },
      });
      result.servers.imported++;
    }
  }

  if (opts.importEpg !== false) {
    for (const e of data.epgSources) {
      const dup = await prisma.epgSource.findFirst({ where: { url: e.url } });
      if (dup) {
        result.epgSources.skipped++;
        continue;
      }
      await prisma.epgSource.create({
        data: { name: e.name, url: e.url, country: e.country ?? null },
      });
      result.epgSources.imported++;
    }
  }

  return result;
}
