import type {
  MigrationBundle,
  MigrationBouquetRow,
  MigrationEnigmaRow,
  MigrationLineRow,
  MigrationMagRow,
  MigrationPhase2Data,
  MigrationResellerRow,
  MigrationSource,
  MigrationStreamRow,
} from "./types";
import {
  mapCategories,
  mapEpgSources,
  mapServers,
} from "./phase2";
import {
  mergeSqlTables,
  parseMysqlInserts,
  rowToRecord,
  type SqlTableData,
} from "./sql-parse";
import { PANEL_PROFILES, firstTableFound } from "./profiles";

function parseJsonField(val: unknown): unknown {
  if (val == null || val === "") return null;
  if (typeof val === "object") return val;
  const s = String(val).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    if (s.includes(",")) return s.split(",").map((x) => x.trim());
    return s;
  }
}

function idsFromBouquetField(val: unknown): string[] {
  const parsed = parseJsonField(val);
  if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  if (typeof parsed === "string" && parsed) return [parsed];
  return [];
}

function streamUrlFromSource(val: unknown): string {
  const parsed = parseJsonField(val);
  if (Array.isArray(parsed) && parsed.length) return String(parsed[0]);
  if (typeof parsed === "string" && parsed) return parsed;
  return String(val ?? "").trim();
}

function unixToDate(val: unknown): Date {
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return new Date(Date.now() + 365 * 86400000);
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms);
}

function mapStreamType(val: unknown, source: MigrationSource): "LIVE" | "MOVIE" | "SERIES" {
  const n = Number(val);
  if (source === "xui" || source === "onestream" || source === "xtream_ui") {
    if (n === 2 || n === 5) return "MOVIE";
    if (n === 3 || n === 4) return "SERIES";
  }
  const s = String(val ?? "").toLowerCase();
  if (s.includes("movie") || s === "vod") return "MOVIE";
  if (s.includes("series") || s.includes("episode")) return "SERIES";
  return "LIVE";
}

function lineStatusFromRow(r: Record<string, unknown>): MigrationLineRow["status"] {
  if (Number(r.is_banned) === 1 || r.banned === 1) return "BANNED";
  if (Number(r.is_disabled) === 1 || Number(r.enabled) === 0 || Number(r.status) === 0)
    return "DISABLED";
  const exp = r.exp_date ?? r.expires ?? r.expire_date ?? r.expires_at ?? r.expiration;
  if (exp && unixToDate(exp).getTime() < Date.now()) return "EXPIRED";
  return "ACTIVE";
}

function mapStreams(data: SqlTableData | null, source: MigrationSource): MigrationStreamRow[] {
  if (!data) return [];
  const out: MigrationStreamRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const legacyId = String(r.id ?? r.stream_id ?? "");
    if (!legacyId) continue;
    const name = String(
      r.stream_display_name ??
        r.display_name ??
        r.name ??
        r.channel_name ??
        r.title ??
        `Stream ${legacyId}`
    );
    const url = streamUrlFromSource(
      r.stream_source ??
        r.source ??
        r.url ??
        r.stream_url ??
        r.direct_source ??
        r.playback_url
    );
    if (!url) continue;
    out.push({
      legacyId,
      name,
      streamUrl: url,
      type: mapStreamType(r.type ?? r.stream_type, source),
      streamIcon: r.stream_icon
        ? String(r.stream_icon)
        : r.logo
          ? String(r.logo)
          : undefined,
      categoryLegacyId:
        r.category_id != null
          ? String(r.category_id)
          : r.stream_category_id != null
            ? String(r.stream_category_id)
            : undefined,
      categoryName: r.category_name ? String(r.category_name) : undefined,
      epgChannelId: r.epg_channel_id
        ? String(r.epg_channel_id)
        : r.epg_id
          ? String(r.epg_id)
          : r.channel_id
            ? String(r.channel_id)
            : undefined,
      channelId: r.channel_id ? String(r.channel_id) : r.custom_sid ? String(r.custom_sid) : undefined,
      containerExtension: r.container_extension ? String(r.container_extension) : undefined,
      isActive: Number(r.is_deleted ?? 0) !== 1 && Number(r.enabled ?? 1) !== 0,
    });
  }
  return out;
}

function mapBouquets(data: SqlTableData | null): MigrationBouquetRow[] {
  if (!data) return [];
  const out: MigrationBouquetRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const legacyId = String(r.id ?? r.bouquet_id ?? "");
    if (!legacyId) continue;
    const name = String(
      r.bouquet_name ?? r.name ?? r.package_name ?? r.title ?? `Bouquet ${legacyId}`
    );
    const channels =
      r.bouquet_channels ??
      r.bouquet_streams ??
      r.channels ??
      r.stream_ids ??
      r.streams;
    out.push({
      legacyId,
      name,
      streamLegacyIds: idsFromBouquetField(channels),
      sortOrder: Number(r.sort_order ?? r.order ?? 0) || 0,
    });
  }
  return out;
}

function mapLines(data: SqlTableData | null): MigrationLineRow[] {
  if (!data) return [];
  const out: MigrationLineRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const username = String(r.username ?? r.user ?? r.login ?? r.account ?? "").trim();
    const password = String(r.password ?? r.pass ?? r.pwd ?? "").trim();
    if (!username || !password) continue;
    const bouquetField = r.bouquet ?? r.bouquets ?? r.bouquet_ids ?? r.package_id;
    out.push({
      legacyId: r.id != null ? String(r.id) : undefined,
      username,
      password,
      expiresAt: unixToDate(
        r.exp_date ?? r.expires ?? r.expire_date ?? r.expires_at ?? r.expiration ?? r.exp
      ),
      maxConnections: Math.max(1, Number(r.max_connections ?? r.max_cons ?? 1) || 1),
      status: lineStatusFromRow(r),
      bouquetLegacyIds: idsFromBouquetField(bouquetField),
      notes: r.admin_notes ? String(r.admin_notes) : r.notes ? String(r.notes) : undefined,
      allowedIps: r.allowed_ips ? String(r.allowed_ips) : undefined,
      lockToIp: Number(r.lock_device ?? r.lock_to_ip ?? 0) === 1,
      canWatchAdult: Number(r.is_adult ?? r.adult ?? 1) !== 0,
      allowedCountries: r.allowed_countries ? String(r.allowed_countries) : undefined,
      blockedCountries: r.blocked_countries ? String(r.blocked_countries) : undefined,
      allowedOutput: r.allowed_outputs
        ? String(r.allowed_outputs)
        : r.output_formats
          ? String(r.output_formats)
          : undefined,
      ownerLegacyId:
        r.member_id != null
          ? String(r.member_id)
          : r.reseller_id != null
            ? String(r.reseller_id)
            : r.created_by != null
              ? String(r.created_by)
              : undefined,
    });
  }
  return out;
}

function mapResellers(data: SqlTableData | null): MigrationResellerRow[] {
  if (!data) return [];
  const out: MigrationResellerRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const username = String(r.username ?? "").trim();
    const password = String(r.password ?? "").trim();
    if (!username || !password) continue;
    if (Number(r.is_admin ?? 0) === 1) continue;
    const group = Number(r.member_group_id ?? r.group_id ?? 0);
    const isReseller = Number(r.is_reseller ?? 0) === 1 || group > 1;
    if (!isReseller) continue;
    out.push({
      legacyId: r.id != null ? String(r.id) : undefined,
      username,
      password,
      credits: Number(r.credits ?? 0) || 0,
      isActive: Number(r.status ?? 1) !== 0,
    });
  }
  return out;
}

function formatMac(raw: string): string | null {
  const mac = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/gi, "");
  if (mac.length < 12) return null;
  return mac.match(/.{1,2}/g)?.join(":") ?? mac;
}

function mapMag(
  data: SqlTableData | null,
  lineIdToUsername: Map<string, string>
): MigrationMagRow[] {
  if (!data) return [];
  const out: MigrationMagRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const formatted = formatMac(String(r.mac ?? r.mac_address ?? ""));
    if (!formatted) continue;
    let lineUsername = String(r.username ?? r.line_username ?? "").trim();
    if (!lineUsername && r.user_id != null) {
      lineUsername = lineIdToUsername.get(String(r.user_id)) ?? "";
    }
    if (!lineUsername && r.line_id != null) {
      lineUsername = lineIdToUsername.get(String(r.line_id)) ?? "";
    }
    if (!lineUsername) continue;
    out.push({
      mac: formatted,
      lineUsername,
      model: r.model ? String(r.model) : undefined,
    });
  }
  return out;
}

function mapEnigma(
  data: SqlTableData | null,
  lineIdToUsername: Map<string, string>
): MigrationEnigmaRow[] {
  if (!data) return [];
  const out: MigrationEnigmaRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const formatted = formatMac(String(r.mac ?? r.mac_address ?? ""));
    if (!formatted) continue;
    let lineUsername = String(r.username ?? r.line_username ?? "").trim();
    if (!lineUsername && r.user_id != null) {
      lineUsername = lineIdToUsername.get(String(r.user_id)) ?? "";
    }
    if (!lineUsername && r.line_id != null) {
      lineUsername = lineIdToUsername.get(String(r.line_id)) ?? "";
    }
    if (!lineUsername) continue;
    out.push({
      mac: formatted,
      lineUsername,
      model: r.model ? String(r.model) : undefined,
    });
  }
  return out;
}

function loadPhase2FromSql(sql: string, source: MigrationSource): MigrationPhase2Data {
  const profile = PANEL_PROFILES[source];
  return {
    categories: mapCategories(loadSqlTable(sql, profile.categories)),
    servers: mapServers(loadSqlTable(sql, profile.servers)),
    epgSources: mapEpgSources(loadSqlTable(sql, profile.epg)),
  };
}

function lineIdMapFromLines(data: SqlTableData | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!data) return map;
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const id = r.id != null ? String(r.id) : "";
    const username = String(r.username ?? r.user ?? "").trim();
    if (id && username) map.set(id, username);
  }
  return map;
}

export function loadSqlTable(sql: string, tableNames: string[]): SqlTableData | null {
  for (const name of tableNames) {
    const chunks = parseMysqlInserts(sql, name);
    const merged = mergeSqlTables(chunks);
    if (merged && merged.rows.length) return merged;
  }
  return null;
}

export type MigrationTableSet = {
  streams: SqlTableData | null;
  bouquets: SqlTableData | null;
  lines: SqlTableData | null;
  resellers: SqlTableData | null;
  mag: SqlTableData | null;
  enigma: SqlTableData | null;
};

export function buildMigrationBundle(
  tables: MigrationTableSet,
  source: MigrationSource,
  phase2?: MigrationPhase2Data
): MigrationBundle {
  const lineIdToUsername = lineIdMapFromLines(tables.lines);
  return {
    source,
    streams: mapStreams(tables.streams, source),
    bouquets: mapBouquets(tables.bouquets),
    lines: mapLines(tables.lines),
    resellers: tables.resellers ? mapResellers(tables.resellers) : [],
    magDevices: tables.mag ? mapMag(tables.mag, lineIdToUsername) : [],
    enigmaDevices: tables.enigma ? mapEnigma(tables.enigma, lineIdToUsername) : [],
    phase2,
  };
}

export function bundleFromSql(sql: string, source: MigrationSource): MigrationBundle {
  const profile = PANEL_PROFILES[source];
  const streamsTable = firstTableFound(sql, profile.streams) ?? profile.streams[0];
  const bouquetsTable = firstTableFound(sql, profile.bouquets) ?? profile.bouquets[0];
  const linesTable = firstTableFound(sql, profile.lines) ?? profile.lines[0];
  let resellersTable = firstTableFound(sql, profile.resellers);
  if (resellersTable && resellersTable === linesTable) resellersTable = null;
  const magTable = firstTableFound(sql, profile.mag);
  const enigmaTable = firstTableFound(sql, profile.enigma);

  return buildMigrationBundle(
    {
      streams: loadSqlTable(sql, [streamsTable]),
      bouquets: loadSqlTable(sql, [bouquetsTable]),
      lines: loadSqlTable(sql, [linesTable]),
      resellers: resellersTable ? loadSqlTable(sql, [resellersTable]) : null,
      mag: magTable ? loadSqlTable(sql, [magTable]) : null,
      enigma: enigmaTable ? loadSqlTable(sql, [enigmaTable]) : null,
    },
    source,
    loadPhase2FromSql(sql, source)
  );
}

export function bundleFromJson(
  raw: unknown,
  source: MigrationSource
): MigrationBundle {
  const obj = raw as Record<string, unknown>;
  const pick = <T>(key: string, alt?: string): T[] => {
    const v = obj[key] ?? (alt ? obj[alt] : undefined);
    return Array.isArray(v) ? (v as T[]) : [];
  };

  return {
    source: (obj.source as MigrationSource) ?? source,
    bouquets: pick("bouquets").map((b) => {
      const row = b as Record<string, unknown>;
      return {
        legacyId: String(row.legacyId ?? row.id ?? ""),
        name: String(row.name ?? ""),
        streamLegacyIds: (row.streamLegacyIds as string[]) ?? (row.streams as string[]) ?? [],
        sortOrder: Number(row.sortOrder ?? 0),
      };
    }),
    streams: pick("streams").map((s) => {
      const row = s as Record<string, unknown>;
      return {
        legacyId: String(row.legacyId ?? row.id ?? ""),
        name: String(row.name ?? ""),
        streamUrl: String(row.streamUrl ?? row.url ?? ""),
        type: (row.type as MigrationStreamRow["type"]) ?? "LIVE",
        streamIcon: row.streamIcon ? String(row.streamIcon) : undefined,
        categoryLegacyId: row.categoryLegacyId ? String(row.categoryLegacyId) : undefined,
        categoryName: row.categoryName ? String(row.categoryName) : undefined,
        epgChannelId: row.epgChannelId ? String(row.epgChannelId) : undefined,
        channelId: row.channelId ? String(row.channelId) : undefined,
        containerExtension: row.containerExtension ? String(row.containerExtension) : undefined,
        isActive: row.isActive !== false,
      };
    }),
    lines: pick("lines").map((l) => {
      const row = l as Record<string, unknown>;
      return {
        legacyId: row.legacyId ? String(row.legacyId) : undefined,
        username: String(row.username ?? ""),
        password: String(row.password ?? ""),
        expiresAt: row.expiresAt
          ? new Date(String(row.expiresAt))
          : unixToDate(row.exp_date),
        maxConnections: Number(row.maxConnections ?? row.max_connections ?? 1),
        status: (row.status as MigrationLineRow["status"]) ?? "ACTIVE",
        bouquetLegacyIds: (row.bouquetLegacyIds as string[]) ?? [],
        notes: row.notes ? String(row.notes) : undefined,
        allowedIps: row.allowedIps ? String(row.allowedIps) : undefined,
        lockToIp: Boolean(row.lockToIp),
        canWatchAdult: row.canWatchAdult !== false,
        allowedCountries: row.allowedCountries ? String(row.allowedCountries) : undefined,
        blockedCountries: row.blockedCountries ? String(row.blockedCountries) : undefined,
        allowedOutput: row.allowedOutput ? String(row.allowedOutput) : undefined,
        ownerLegacyId: row.ownerLegacyId ? String(row.ownerLegacyId) : undefined,
      };
    }),
    resellers: pick<Record<string, unknown>>("resellers").map((row) => ({
      legacyId: row.legacyId ? String(row.legacyId) : undefined,
      username: String(row.username ?? ""),
      password: String(row.password ?? ""),
      credits: Number(row.credits ?? 0),
      isActive: row.isActive !== false,
    })),
    magDevices: pick<Record<string, unknown>>("magDevices", "mag").map((row) => ({
      mac: String(row.mac ?? ""),
      lineUsername: String(row.lineUsername ?? row.username ?? ""),
      model: row.model ? String(row.model) : undefined,
    })),
    enigmaDevices: pick<Record<string, unknown>>("enigmaDevices", "enigma").map((row) => ({
      mac: String(row.mac ?? ""),
      lineUsername: String(row.lineUsername ?? row.username ?? ""),
      model: row.model ? String(row.model) : undefined,
    })),
    phase2: obj.phase2 as MigrationPhase2Data | undefined,
  };
}

export function pgRowsToTableData(rows: Record<string, unknown>[]): SqlTableData | null {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]).map((c) => c.toLowerCase());
  const dataRows = rows.map((row) =>
    columns.map((col) => {
      const key = Object.keys(row).find((k) => k.toLowerCase() === col);
      return key != null ? row[key] : null;
    })
  );
  return { columns, rows: dataRows };
}
