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
import { formatXuiCategoryName } from "@/lib/category-xui-name";

export type { MigrationCategoryRow, MigrationEpgRow, MigrationPhase2Data, MigrationServerRow };

const PHASE2_TABLE_SCORES = {
  categories: { patterns: [/^categories?$/i, /^stream_categories?$/i], penalty: /log/i },
  servers: {
    patterns: [/^streaming_servers?$/i, /^servers?$/i, /^stream_servers?$/i],
    penalty: /log|panel/i,
  },
  epg: { patterns: [/^epg_sources?$/i, /^epgs$/i, /^epg$/i, /^epg_api$/i], penalty: /program|channel|data_cache/i },
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
  const out: (MigrationCategoryRow & { dumpIndex: number })[] = [];
  data.rows.forEach((row, dumpIndex) => {
    const r = rowToRecord(data.columns, row);
    const legacyId = String(r.id ?? "");
    if (!legacyId) return;
    const parentRaw = r.parent_id ?? r.parentId ?? r.parent;
    const nameRaw = String(
      r.category_name ?? r.name ?? r.title ?? `Category ${legacyId}`
    ).trim() || `Category ${legacyId}`;
    const isAdult = Number(r.is_adult ?? r.adult ?? 0) === 1;
    const name = formatXuiCategoryName(nameRaw, { isAdult });
    // Skip rows that are clearly bouquet channel JSON dumped into categories.
    if (nameRaw === "[]" || nameRaw === "{}" || /^\[.*\]$/.test(nameRaw)) return;

    const typeRaw = String(
      r.category_type ?? r.type ?? r.cat_type ?? r.stream_type ?? ""
    )
      .trim()
      .toUpperCase();
    const nameKey = nameRaw.toLowerCase();

    // Classic XUI/XC: category_type 1=live, 2=movie, 3=series (4=radio on some panels).
    let categoryType: MigrationCategoryRow["categoryType"] = "LIVE";
    if (
      typeRaw.includes("MOVIE") ||
      typeRaw === "VOD" ||
      typeRaw === "2" ||
      typeRaw === "MOVIES"
    ) {
      categoryType = "MOVIE";
    } else if (
      typeRaw.includes("SERIES") ||
      typeRaw === "3" ||
      typeRaw === "TV" ||
      typeRaw === "TV SERIES"
    ) {
      categoryType = "SERIES";
    } else if (typeRaw.includes("RADIO") || typeRaw === "4") {
      categoryType = "RADIO";
    } else if (
      typeRaw.includes("LIVE") ||
      typeRaw === "0" ||
      typeRaw === "1" ||
      typeRaw === "LIVE STREAMS"
    ) {
      categoryType = "LIVE";
    } else if (!typeRaw) {
      // Infer from name when category_type column was missing / mis-mapped.
      if (nameKey === "movie" || nameKey === "movies" || nameKey === "vod") categoryType = "MOVIE";
      else if (nameKey === "series" || nameKey === "tv series" || nameKey === "tv")
        categoryType = "SERIES";
      else if (nameKey === "radio" || nameKey === "radios") categoryType = "RADIO";
      else categoryType = "LIVE";
    }

    // Type-only placeholder rows (name is just "live"/"movie"/"series") are not real
    // stream categories — skip them so they don't pollute Manage Categories.
    if (["live", "movie", "movies", "series", "radio", "vod", "tv"].includes(nameKey)) {
      return;
    }

    const explicit = r.sort_order ?? r.order ?? r.cat_order;
    const hasExplicit =
      explicit != null && String(explicit).trim() !== "" && Number.isFinite(Number(explicit));
    const sortOrder = hasExplicit && Number(explicit) !== 0 ? Number(explicit) : dumpIndex;

    out.push({
      legacyId,
      name,
      parentLegacyId:
        parentRaw != null && String(parentRaw).trim() && String(parentRaw) !== "0"
          ? String(parentRaw)
          : undefined,
      categoryType,
      isAdult,
      sortOrder,
      dumpIndex,
    });
  });
  out.sort((a, b) => {
    const ao = Number(a.sortOrder) || 0;
    const bo = Number(b.sortOrder) || 0;
    if (ao !== bo) return ao - bo;
    return a.dumpIndex - b.dumpIndex;
  });
  return out.map(({ dumpIndex: _dumpIndex, ...rest }, i) => ({ ...rest, sortOrder: i }));
}

export function mapServers(data: SqlTableData | null): MigrationServerRow[] {
  if (!data) return [];
  const out: MigrationServerRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const legacyId = String(r.id ?? "");
    const host = String(r.server_ip ?? r.host ?? r.ip ?? "").trim();
    if (!legacyId || !host) continue;
    const httpPort =
      Number(r.port ?? r.http_port ?? r.http_broadcast_port ?? NaN) || 0;
    const httpsPort =
      Number(r.https_port ?? r.https_broadcast_port ?? NaN) || undefined;
    const enableHttps =
      Number(r.enable_https ?? r.https ?? 0) === 1 ||
      String(r.protocol ?? "").toLowerCase() === "https";
    const protocol = enableHttps
      ? "https"
      : String(r.protocol ?? "http").trim() || "http";
    const port =
      protocol === "https" && httpsPort
        ? httpsPort
        : httpPort || (protocol === "https" ? 443 : 80);
    out.push({
      legacyId,
      name: String(r.server_name ?? r.name ?? host),
      host,
      port,
      protocol,
      domain: String(
        r.domain ?? r.server_domain ?? r.domain_name ?? ""
      ).trim() || undefined,
      maxClients: Number(r.total_clients ?? r.max_clients ?? r.capacity ?? NaN) || undefined,
      privateIp: r.private_ip
        ? String(r.private_ip)
        : r.local_ip
          ? String(r.local_ip)
          : undefined,
      httpsPort: httpsPort || undefined,
      rtmpPort: Number(r.rtmp_port ?? NaN) || undefined,
    });
  }
  return out;
}

export function mapEpgSources(data: SqlTableData | null): MigrationEpgRow[] {
  if (!data) return [];
  const out: MigrationEpgRow[] = [];
  const seen = new Set<string>();

  function pushSource(legacyId: string | undefined, name: string, url: string, country?: string) {
    const clean = url.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      legacyId,
      name: name.trim() || "EPG",
      url: clean,
      country: country?.trim() || undefined,
    });
  }

  function extractUrlFromBlob(raw: unknown): string | null {
    if (raw == null) return null;
    const s = typeof raw === "string" ? raw : JSON.stringify(raw);
    const https = s.match(/https?:\/\/[^\s"'<>\\]+/i);
    if (https?.[0]) return https[0].replace(/[),;]+$/, "");
    return null;
  }

  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const legacyId = r.id != null ? String(r.id) : undefined;
    const name = String(r.name ?? r.epg_name ?? r.title ?? r.source_name ?? "EPG");
    const country = r.country
      ? String(r.country)
      : r.lang
        ? String(r.lang)
        : r.language
          ? String(r.language)
          : undefined;

    const candidates = [
      r.url,
      r.epg_url,
      r.xmltv_url,
      r.epg_file,
      r.filename,
      r.source,
      r.path,
      r.location,
      r.link,
    ]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean);

    // XUI often stores feed metadata in a `data` blob — pull any http(s) URL out of it.
    const fromData = extractUrlFromBlob(r.data ?? r.epg_data ?? r.xml);
    if (fromData) candidates.push(fromData);

    let chosen = "";
    for (const c of candidates) {
      if (/^https?:\/\//i.test(c)) {
        chosen = c;
        break;
      }
    }
    if (!chosen) {
      for (const c of candidates) {
        const usable =
          c.includes("://") ||
          /\.xml(\.gz)?$/i.test(c) ||
          /\.gz$/i.test(c) ||
          /\.xmltv$/i.test(c) ||
          /xmltv|epg/i.test(c);
        if (usable) {
          chosen = /^https?:\/\//i.test(c) || c.includes("://") ? c : c;
          break;
        }
      }
    }
    // Last resort: absolute path that looks like an XMLTV file on disk (still import so admin can fix URL)
    if (!chosen) {
      for (const c of candidates) {
        if (c.startsWith("/") && /\.(xml|gz|xmltv)$/i.test(c)) {
          chosen = c;
          break;
        }
      }
    }
    if (!chosen) continue;
    pushSource(legacyId, name, chosen, country);
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
          const nextOrder = Number(c.sortOrder) || 0;
          if (dup.sortOrder !== nextOrder) {
            await prisma.category.update({
              where: { id: dup.id },
              data: { sortOrder: nextOrder },
            });
          }
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
            ...(Number.isFinite(s.httpsPort) && s.httpsPort
              ? { httpsPort: Number(s.httpsPort) }
              : {}),
            ...(Number.isFinite(s.rtmpPort) && s.rtmpPort
              ? { rtmpPort: Number(s.rtmpPort) }
              : {}),
            sortOrder: i,
            // First imported = main (panel); all others default to load balancers.
            panelSettings:
              i === 0
                ? ({ advanced: { serverRole: "main" } } as Prisma.InputJsonValue)
                : ({ advanced: { serverRole: "lb" } } as Prisma.InputJsonValue),
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
