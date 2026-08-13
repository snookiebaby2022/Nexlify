import { prisma } from "@/lib/prisma";
import { pgRowsToTableData } from "./map-rows";
import { rowToRecord, type SqlTableData } from "./sql-parse";
import type {
  MigrationCategoryRow,
  MigrationEpgRow,
  MigrationPhase2Data,
  MigrationServerRow,
} from "./types";

export type { MigrationCategoryRow, MigrationEpgRow, MigrationPhase2Data, MigrationServerRow };

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
    const parentRaw = r.parent_id ?? r.parentId ?? r.parent;
    out.push({
      legacyId,
      name: String(r.category_name ?? r.name ?? `Category ${legacyId}`).trim() || `Category ${legacyId}`,
      parentLegacyId:
        parentRaw != null && String(parentRaw).trim() && String(parentRaw) !== "0"
          ? String(parentRaw)
          : undefined,
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
  fetchTable: (schema: string, table: string) => Promise<Record<string, unknown>[]>
): Promise<MigrationPhase2Data> {
  const load = async (kind: keyof typeof PHASE2_TABLE_SCORES) => {
    const name = pickPhase2Table(tables, kind);
    if (!name) return null;
    try {
      return pgRowsToTableData(await fetchTable(schema, name));
    } catch {
      return null;
    }
  };

  return {
    categories: mapCategories(await load("categories")),
    servers: mapServers(await load("servers")),
    epgSources: mapEpgSources(await load("epg")),
  };
}

export async function applyMigrationPhase2(
  data: MigrationPhase2Data,
  opts: {
    importCategories?: boolean;
    importServers?: boolean;
    importEpg?: boolean;
    skipExisting?: boolean;
    onProgress?: (phase: string, current: number, total: number) => void;
  }
) {
  const result = {
    categories: { imported: 0, skipped: 0 },
    servers: { imported: 0, skipped: 0 },
    epgSources: { imported: 0, skipped: 0 },
    warnings: [] as string[],
  };
  const categoryIdByLegacy = new Map<string, string>();
  const serverIdByLegacy = new Map<string, string>();

  if (opts.importCategories !== false && data.categories.length) {
    // Pass 1: create/find all categories without parents
    for (let i = 0; i < data.categories.length; i++) {
      const c = data.categories[i];
      opts.onProgress?.("categories", i + 1, data.categories.length);
      const name = String(c.name ?? "").trim();
      if (!name || !c.legacyId) {
        result.categories.skipped++;
        continue;
      }
      try {
        const dup = await prisma.category.findFirst({ where: { name } });
        if (dup) {
          categoryIdByLegacy.set(c.legacyId, dup.id);
          result.categories.skipped++;
          continue;
        }
        const created = await prisma.category.create({ data: { name } });
        categoryIdByLegacy.set(c.legacyId, created.id);
        result.categories.imported++;
      } catch {
        result.categories.skipped++;
      }
    }

    // Pass 2: attach parent/subcategory links
    for (const c of data.categories) {
      if (!c.parentLegacyId || !c.legacyId) continue;
      const id = categoryIdByLegacy.get(c.legacyId);
      const parentId = categoryIdByLegacy.get(c.parentLegacyId);
      if (!id || !parentId || id === parentId) continue;
      try {
        await prisma.category.update({ where: { id }, data: { parentId } });
      } catch {
        /* keep category without parent rather than fail import */
      }
    }
  }

  if (opts.importServers !== false && data.servers.length) {
    for (let i = 0; i < data.servers.length; i++) {
      const s = data.servers[i];
      opts.onProgress?.("servers", i + 1, data.servers.length);
      const host = String(s.host ?? "").trim();
      const name = String(s.name ?? host).trim();
      if (!host || !s.legacyId) {
        result.servers.skipped++;
        continue;
      }
      try {
        if (opts.skipExisting) {
          const dup = await prisma.streamServer.findFirst({ where: { host } });
          if (dup) {
            serverIdByLegacy.set(s.legacyId, dup.id);
            result.servers.skipped++;
            continue;
          }
        }
        const created = await prisma.streamServer.create({
          data: {
            name: name || host,
            host,
            port: Number(s.port) || 80,
            protocol: String(s.protocol ?? "http").trim() || "http",
          },
        });
        serverIdByLegacy.set(s.legacyId, created.id);
        result.servers.imported++;
      } catch {
        result.servers.skipped++;
      }
    }
  }

  if (opts.importEpg !== false && data.epgSources.length) {
    for (let i = 0; i < data.epgSources.length; i++) {
      const e = data.epgSources[i];
      opts.onProgress?.("epg", i + 1, data.epgSources.length);
      const url = String(e.url ?? "").trim();
      const name = String(e.name ?? "EPG").trim() || "EPG";
      if (!url) {
        result.epgSources.skipped++;
        continue;
      }
      try {
        const dup = await prisma.epgSource.findFirst({ where: { url } });
        if (dup) {
          result.epgSources.skipped++;
          continue;
        }
        await prisma.epgSource.create({
          data: { name, url, country: e.country?.trim() || null },
        });
        result.epgSources.imported++;
      } catch {
        result.epgSources.skipped++;
      }
    }
  }

  return { result, categoryIdByLegacy, serverIdByLegacy };
}
