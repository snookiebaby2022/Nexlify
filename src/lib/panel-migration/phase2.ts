import { prisma } from "@/lib/prisma";
import { pgRowsToTableData } from "./map-rows";
import { rowToRecord, type SqlTableData } from "./sql-parse";
import type { Prisma } from "@prisma/client";
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
  packages: {
    patterns: [
      /^credit_packages?$/i,
      /^user_packages?$/i,
      /^line_packages?$/i,
      /^plans?$/i,
      /^packages?$/i,
    ],
    penalty: /log|stream/i,
  },
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
    const typeRaw = String(
      r.category_type ?? r.type ?? r.cat_type ?? r.stream_type ?? ""
    ).toUpperCase();
    let categoryType: MigrationCategoryRow["categoryType"] = "LIVE";
    if (typeRaw.includes("MOVIE") || typeRaw === "VOD" || typeRaw === "1") categoryType = "MOVIE";
    else if (typeRaw.includes("SERIES") || typeRaw === "2") categoryType = "SERIES";
    else if (typeRaw.includes("RADIO")) categoryType = "RADIO";
    else if (typeRaw.includes("LIVE") || typeRaw === "0") categoryType = "LIVE";
    out.push({
      legacyId,
      name: String(r.category_name ?? r.name ?? `Category ${legacyId}`).trim() || `Category ${legacyId}`,
      parentLegacyId:
        parentRaw != null && String(parentRaw).trim() && String(parentRaw) !== "0"
          ? String(parentRaw)
          : undefined,
      categoryType,
      isAdult: Number(r.is_adult ?? r.adult ?? 0) === 1,
      sortOrder: Number(r.sort_order ?? r.order ?? r.cat_order ?? 0) || 0,
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
      domain: r.domain ? String(r.domain) : r.server_domain ? String(r.server_domain) : undefined,
      maxClients: Number(r.total_clients ?? r.max_clients ?? r.capacity ?? NaN) || undefined,
      privateIp: r.private_ip ? String(r.private_ip) : r.local_ip ? String(r.local_ip) : undefined,
    });
  }
  return out;
}

export function mapEpgSources(data: SqlTableData | null): MigrationEpgRow[] {
  if (!data) return [];
  const out: MigrationEpgRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const url = String(
      r.url ??
        r.epg_url ??
        r.xmltv_url ??
        r.epg_file ??
        r.filename ??
        r.source ??
        r.path ??
        ""
    ).trim();
    if (!url) continue;
    // Skip relative/local-only paths that aren't fetchable URLs unless they look like http(s)
    const usable =
      /^https?:\/\//i.test(url) ||
      url.includes("://") ||
      url.endsWith(".xml") ||
      url.endsWith(".gz") ||
      url.endsWith(".xmltv");
    if (!usable && !url.includes("/")) continue;
    out.push({
      legacyId: r.id != null ? String(r.id) : undefined,
      name: String(r.name ?? r.epg_name ?? r.title ?? "EPG"),
      url,
      country: r.country ? String(r.country) : r.lang ? String(r.lang) : undefined,
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

  const packageTable = await load("packages");
  // Dynamic import avoids circular dependency with map-rows ↔ phase2.
  const { mapPackages } = await import("./map-rows");

  return {
    categories: mapCategories(await load("categories")),
    servers: mapServers(await load("servers")),
    epgSources: mapEpgSources(await load("epg")),
    packages: mapPackages(packageTable),
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
  const epgSourceIdByLegacy = new Map<string, string>();

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
        const categoryType = (c.categoryType as "LIVE" | "MOVIE" | "SERIES" | "RADIO") || "LIVE";
        const dup = await prisma.category.findFirst({ where: { name, categoryType } });
        if (dup) {
          categoryIdByLegacy.set(c.legacyId, dup.id);
          result.categories.skipped++;
          continue;
        }
        const created = await prisma.category.create({
          data: {
            name,
            categoryType,
            isAdult: c.isAdult === true,
            sortOrder: Number(c.sortOrder) || 0,
          },
        });
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
            domain: s.domain?.trim() || null,
            maxClients: Number(s.maxClients) || 1000,
            privateIp: s.privateIp?.trim() || null,
            sortOrder: i,
            // First imported server is the main server.
            panelSettings:
              i === 0
                ? ({ advanced: { serverRole: "main" } } as Prisma.InputJsonValue)
                : undefined,
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
          if (e.legacyId) epgSourceIdByLegacy.set(e.legacyId, dup.id);
          result.epgSources.skipped++;
          continue;
        }
        const created = await prisma.epgSource.create({
          data: { name, url, country: e.country?.trim() || null },
        });
        if (e.legacyId) epgSourceIdByLegacy.set(e.legacyId, created.id);
        result.epgSources.imported++;
      } catch {
        result.epgSources.skipped++;
      }
    }
  }

  return { result, categoryIdByLegacy, serverIdByLegacy, epgSourceIdByLegacy };
}
