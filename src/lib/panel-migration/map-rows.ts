import type {
  MigrationBundle,
  MigrationBouquetRow,
  MigrationEnigmaRow,
  MigrationLineRow,
  MigrationMagRow,
  MigrationPackageRow,
  MigrationPhase2Data,
  MigrationPhase3Data,
  MigrationResellerRow,
  MigrationSource,
  MigrationStreamRow,
} from "./types";
import {
  mapCategories,
  mapEpgSources,
  mapServers,
} from "./phase2";
import { inferPackageDaysFromName, packageDurationSortKey } from "@/lib/package-days";
import {
  mergeSqlTables,
  parseAllMysqlInserts,
  parseCreateTableColumns,
  parseMysqlInserts,
  parseMysqlInsertsSafe,
  parseSqlDumpFile,
  rowToRecord,
  type SqlTableData,
} from "./sql-parse";
import { PANEL_PROFILES, firstTableFound } from "./profiles";
import { applyHeaderlessInference } from "./headerless-map";
import {
  enrichSqlTablesFromJunctions,
  flattenIdList,
} from "./sql-junctions";
import {
  enrichStreamsFromSys,
  finalizeVodStreamDefaults,
  loadStreamsTypeMap,
  mapSeriesEpisodesFromSql,
  resolveStreamType,
} from "./xui-extras";
import { loadPhase3FromSql } from "./phase3";
import { firstStreamUrl, isPendingStreamUrl, pendingStreamUrl } from "./stream-source-urls";

function idsFromBouquetField(val: unknown): string[] {
  return flattenIdList(val);
}

const VOD_CONTAINER_RE = /^(mp4|mkv|avi|mov|m4v|wmv|flv|webm|ts|mpg|mpeg)$/i;

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
  if (
    source === "xui" ||
    source === "onestream" ||
    source === "xtream_ui" ||
    source === "streamcreed" ||
    source === "nxt" ||
    source === "midnight"
  ) {
    // Classic Xtream / XUI.one / StreamCreed / NXT / Midnight stream.type:
    // 1 = live, 2 = movie, 3 = created channel (live), 4 = radio, 5 = series
    if (n === 2) return "MOVIE";
    if (n === 5) return "SERIES";
    if (n === 1 || n === 3 || n === 4) return "LIVE";
  }
  const s = String(val ?? "").toLowerCase();
  if (s.includes("movie") || s === "vod") return "MOVIE";
  if (s.includes("series") || s.includes("episode")) return "SERIES";
  if (s.includes("radio")) return "LIVE";
  return "LIVE";
}

/** XUI often stores category_id as JSON array e.g. "[12]" or [12,34] — take first id. */
function firstLegacyId(val: unknown): string | undefined {
  const ids = flattenIdList(val);
  return ids[0] || undefined;
}

function lineStatusFromRow(r: Record<string, unknown>): MigrationLineRow["status"] {
  if (Number(r.is_banned) === 1 || r.banned === 1) return "BANNED";
  if (
    Number(r.is_disabled) === 1 ||
    Number(r.enabled) === 0 ||
    Number(r.admin_enabled) === 0 ||
    Number(r.status) === 0
  )
    return "DISABLED";
  const exp = r.exp_date ?? r.expires ?? r.expire_date ?? r.expires_at ?? r.expiration;
  if (exp && unixToDate(exp).getTime() < Date.now()) return "EXPIRED";
  return "ACTIVE";
}

function mapStreams(
  data: SqlTableData | null,
  source: MigrationSource,
  typeMap?: Map<string, { type: "LIVE" | "MOVIE" | "SERIES"; isRadio?: boolean }>
): MigrationStreamRow[] {
  if (!data) return [];
  const out: MigrationStreamRow[] = [];
  for (let rowIdx = 0; rowIdx < data.rows.length; rowIdx++) {
    const row = data.rows[rowIdx];
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
    // Never use `??` across these — XUI empty sources are often numeric 0.
    // Keep every playable URL (credentials in path/userinfo included — never stripped).
    const fromSources = firstStreamUrl(
      r.stream_source,
      r.source,
      r.url,
      r.stream_url,
      r.playback_url,
      r.current_source,
      r.adaptive_link,
      r.cchannel_rsources,
      r.target_container && String(r.target_container).includes("://") ? r.target_container : null,
      // direct_source is often a 0/1 flag — only treat as URL when it looks like one
      r.direct_source
    );
    let url = fromSources.primary;
    const backup = fromSources.backup;
    const extras = [...fromSources.extras];
    const backupExplicit = firstStreamUrl(
      r.backup_url,
      r.stream_backup,
      r.backup_source
    ).primary;
    if (backupExplicit && backup && backupExplicit !== backup) {
      extras.unshift(backup);
    }
    // Keep catalog complete: empty XUI sources become pending:// so bouquets/episodes still link
    let usedPending = false;
    if (!url) {
      url = pendingStreamUrl(legacyId, source);
      usedPending = true;
    }
    const seriesName = r.series_name ?? r.show_name ?? r.tv_series;
    const seasonNum = Number(r.season_num ?? r.season ?? r.season_number ?? NaN);
    const episodeNum = Number(r.episode_num ?? r.episode ?? r.episode_number ?? NaN);
    const typeRaw = r.type ?? r.stream_type ?? r.type_key;
    const resolved = typeMap
      ? resolveStreamType(typeRaw, typeMap)
      : {
          type: mapStreamType(typeRaw, source),
          isRadio:
            Number(r.is_radio ?? r.radio ?? 0) === 1 ||
            Number(typeRaw) === 4 ||
            String(typeRaw ?? "").toLowerCase().includes("radio"),
        };
    const containerExtension = r.container_extension
      ? String(r.container_extension).replace(/^\./, "")
      : r.target_container
        ? String(r.target_container).replace(/^\./, "")
        : undefined;
    // VOD files mis-tagged as live (common when type column missing/0): prefer MOVIE.
    let streamType = resolved.type;
    if (
      streamType === "LIVE" &&
      !resolved.isRadio &&
      !usedPending &&
      containerExtension &&
      VOD_CONTAINER_RE.test(containerExtension) &&
      !/\.m3u8?$/i.test(url)
    ) {
      streamType = "MOVIE";
    }
    const categoryLegacyId =
      firstLegacyId(r.category_id) ?? firstLegacyId(r.stream_category_id);
    out.push({
      legacyId,
      name,
      streamUrl: url,
      backupUrl: backupExplicit || backup || undefined,
      extraSourceUrls: extras.length ? extras : undefined,
      type: streamType,
      streamIcon: r.stream_icon
        ? String(r.stream_icon)
        : r.logo
          ? String(r.logo)
          : undefined,
      categoryLegacyId,
      categoryName: r.category_name ? String(r.category_name) : undefined,
      epgChannelId: r.epg_channel_id
        ? String(r.epg_channel_id)
        : r.epg_id
          ? String(r.epg_id)
          : r.channel_id
            ? String(r.channel_id)
            : undefined,
      channelId: r.channel_id ? String(r.channel_id) : r.custom_sid ? String(r.custom_sid) : undefined,
      containerExtension: containerExtension
        ? containerExtension
        : streamType === "MOVIE" || streamType === "SERIES"
          ? "mp4"
          : undefined,
      isActive: Number(r.is_deleted ?? 0) !== 1 && Number(r.enabled ?? 1) !== 0,
      isAdult: Number(r.is_adult ?? r.adult ?? 0) === 1,
      isRadio: resolved.isRadio || Number(r.is_radio ?? r.radio ?? 0) === 1,
      seriesName: seriesName ? String(seriesName) : undefined,
      seasonNum: Number.isFinite(seasonNum) && seasonNum > 0 ? seasonNum : undefined,
      episodeNum: Number.isFinite(episodeNum) && episodeNum > 0 ? episodeNum : undefined,
      serverLegacyId:
        r.server_id != null && String(r.server_id) !== "" && String(r.server_id) !== "0"
          ? String(r.server_id)
          : r.stream_server_id != null
            ? String(r.stream_server_id)
            : undefined,
      notes: r.notes ? String(r.notes) : undefined,
      sortOrder: (() => {
        const n = Number(r.order_num ?? r.sort_order ?? r.channel_order ?? r.order ?? r.num ?? NaN);
        // Fall back to dump row position so LIVE list matches SQL INSERT order
        return Number.isFinite(n) ? n : rowIdx + 1;
      })(),
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
    let name = String(
      r.bouquet_name ?? r.name ?? r.package_name ?? r.title ?? `Bouquet ${legacyId}`
    ).trim();
    // Mis-mapped JSON channel lists sometimes land in the name field as "[]".
    if (!name || name === "[]" || name === "{}" || /^\[.*\]$/.test(name)) {
      name = `Bouquet ${legacyId}`;
    }
    // Modern XUI.one splits live / movies / series / radios into separate columns.
    const streamLegacyIds = [
      ...idsFromBouquetField(
        r.bouquet_channels ?? r.bouquet_streams ?? r.channels ?? r.stream_ids ?? r.streams
      ),
      ...idsFromBouquetField(r.bouquet_movies ?? r.movies ?? r.movie_ids),
      ...idsFromBouquetField(r.bouquet_series ?? r.series ?? r.series_ids),
      ...idsFromBouquetField(r.bouquet_radios ?? r.radios ?? r.radio_ids),
    ];
    out.push({
      legacyId,
      name,
      streamLegacyIds: [...new Set(streamLegacyIds.filter(Boolean))],
      sortOrder:
        Number(r.bouquet_order ?? r.sort_order ?? r.order ?? r.cat_order ?? 0) || 0,
    });
  }
  out.sort((a, b) => {
    const ao = Number(a.sortOrder) || 0;
    const bo = Number(b.sortOrder) || 0;
    if (ao !== bo) return ao - bo;
    return String(a.legacyId).localeCompare(String(b.legacyId), undefined, { numeric: true });
  });
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
    const bouquetField = r.bouquet ?? r.bouquets ?? r.bouquet_ids ?? r.package_id ?? r.packages;
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
        : r.allowed_output
          ? String(r.allowed_output)
          : r.output_formats
            ? String(r.output_formats)
            : undefined,
      ownerLegacyId:
        r.member_id != null && String(r.member_id) !== "" && String(r.member_id) !== "0"
          ? String(r.member_id)
          : r.user_id != null && String(r.user_id) !== "" && String(r.user_id) !== "0"
            ? String(r.user_id)
            : r.reseller_id != null
              ? String(r.reseller_id)
              : r.owner_id != null
                ? String(r.owner_id)
                : r.created_by != null
                  ? String(r.created_by)
                  : undefined,
      isTrial: Number(r.is_trial ?? r.trial ?? 0) === 1,
      isRestreamer: Number(r.is_restreamer ?? r.restreamer ?? 0) === 1,
      allowedUserAgents: r.allowed_ua
        ? String(r.allowed_ua)
        : r.allowed_user_agents
          ? String(r.allowed_user_agents)
          : undefined,
      disallowedUserAgents: r.forced_ua
        ? undefined
        : r.blocked_ua
          ? String(r.blocked_ua)
          : r.disallowed_user_agents
            ? String(r.disallowed_user_agents)
            : undefined,
      forcedServerLegacyId:
        r.forced_country != null && String(r.forced_country).startsWith("server:")
          ? String(r.forced_country).slice(7)
          : r.server_id != null
            ? String(r.server_id)
            : r.forced_server_id != null
              ? String(r.forced_server_id)
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
    const group = Number(r.member_group_id ?? r.group_id ?? r.groupid ?? NaN);
    // XUI group 1 is typically Administrators — skip unless explicitly marked reseller.
    if (Number.isFinite(group) && group <= 1 && Number(r.is_reseller ?? 0) !== 1) continue;

    // Classic XC line-shaped rows (users table used for lines) — skip.
    const looksLikeSubscriberLine =
      r.exp_date != null &&
      (r.bouquet != null || r.max_connections != null) &&
      r.credits == null &&
      r.member_group_id == null &&
      r.owner_id == null &&
      Number(r.is_reseller ?? 0) !== 1;
    if (looksLikeSubscriberLine) continue;

    out.push({
      legacyId: r.id != null ? String(r.id) : undefined,
      username,
      password,
      credits: Number(r.credits ?? 0) || 0,
      isActive: Number(r.status ?? 1) !== 0 && String(r.status ?? "") !== "0",
      email: r.email ? String(r.email) : undefined,
      notes: r.notes ? String(r.notes) : r.admin_notes ? String(r.admin_notes) : undefined,
      maxLines: Number(r.max_accounts ?? r.max_lines ?? r.max_users ?? NaN) || undefined,
      resellerDns: r.reseller_dns
        ? String(r.reseller_dns)
        : r.dns
          ? String(r.dns)
          : undefined,
      parentLegacyId:
        r.owner_id != null && String(r.owner_id) !== "0"
          ? String(r.owner_id)
          : r.parent_id != null && String(r.parent_id) !== "0"
            ? String(r.parent_id)
            : undefined,
    });
  }
  return out;
}

/** Convert XUI package duration (amount + unit) to whole days. */
export function xuiDurationToDays(amount: number, unit: unknown): number {
  if (!Number.isFinite(amount) || amount <= 0) return NaN;
  const u = String(unit ?? "days").trim().toLowerCase();
  if (u.startsWith("hour")) return Math.max(1, Math.ceil(amount / 24));
  if (u.startsWith("day")) return Math.round(amount);
  if (u.startsWith("week")) return Math.round(amount * 7);
  if (u.startsWith("month")) return Math.round(amount * 30);
  if (u.startsWith("year")) return Math.round(amount * 365);
  return Math.round(amount);
}

/** Map duration/credit packages (skip pure channel-package rows already used as bouquets). */
export function mapPackages(data: SqlTableData | null): MigrationPackageRow[] {
  if (!data) return [];
  const out: MigrationPackageRow[] = [];
  for (const row of data.rows) {
    const r = rowToRecord(data.columns, row);
    const legacyId = String(r.id ?? r.package_id ?? "");
    if (!legacyId) continue;
    const trialRaw = r.is_trial ?? r.trial;
    const isTrialPackage =
      trialRaw != null &&
      Number(trialRaw) !== 0 &&
      String(trialRaw).toLowerCase() !== "false" &&
      String(trialRaw).toLowerCase() !== "no";
    // Prefer official duration; fall back to trial fields for trial-only packages.
    const amount = Number(
      isTrialPackage
        ? (r.trial_duration ??
            r.official_duration ??
            r.duration_in_days ??
            r.duration ??
            r.days ??
            NaN)
        : (r.official_duration ??
            r.duration_in_days ??
            r.duration ??
            r.days ??
            r.package_days ??
            r.trial_duration ??
            NaN)
    );
    const unit = isTrialPackage
      ? (r.trial_duration_in ?? r.official_duration_in ?? r.duration_in ?? "days")
      : (r.official_duration_in ?? r.trial_duration_in ?? r.duration_in ?? "days");
    const rawDays = xuiDurationToDays(amount, unit);
    const creditCost = Number(
      r.credits ??
        r.credit_cost ??
        r.cost_credits ??
        r.cost ??
        r.price ??
        r.official_credits ??
        r.trial_credits ??
        NaN
    );
    const hasBillingSignal =
      (Number.isFinite(rawDays) && rawDays > 0) ||
      (Number.isFinite(creditCost) && creditCost > 0) ||
      isTrialPackage;
    // Skip rows that only look like channel bouquets (no duration/credits).
    if (!hasBillingSignal) continue;
    const name = String(
      r.package_name ?? r.name ?? r.title ?? `Package ${legacyId}`
    ).trim();
    if (!name) continue;
    const days =
      inferPackageDaysFromName(name, Number.isFinite(rawDays) ? rawDays : undefined) ??
      (Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 30);
    out.push({
      legacyId,
      name,
      days,
      creditCost: Number.isFinite(creditCost) && creditCost >= 0 ? creditCost : 0,
      maxLines: Math.max(1, Number(r.max_connections ?? r.max_lines ?? r.connections ?? 1) || 1),
      bouquetLegacyIds: idsFromBouquetField(
        r.bouquets ?? r.bouquet_ids ?? r.bouquet ?? r.packages
      ),
      description: r.description ? String(r.description) : undefined,
      isActive: Number(r.status ?? r.is_active ?? r.enabled ?? 1) !== 0,
      sortOrder: Number(r.sort_order ?? r.order ?? 0) || packageDurationSortKey(days, name),
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

function loadPhase2FromSql(
  allTables: Map<string, SqlTableData[]>,
  source: MigrationSource
): MigrationPhase2Data {
  const profile = PANEL_PROFILES[source];
  function findTable(names: string[]): SqlTableData | null {
    for (const name of names) {
      const chunks = allTables.get(name.toLowerCase()) ?? [];
      const merged = mergeSqlTables(chunks);
      if (merged && merged.rows.length) return merged;
    }
    return null;
  }
  return {
    categories: mapCategories(findTable(profile.categories)),
    servers: mapServers(findTable(profile.servers)),
    epgSources: mapEpgSources(findTable(profile.epg)),
    packages: mapPackages(findTable(profile.packages)),
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

/** Like loadSqlTable but returns warnings about missing/malformed tables. */
export function loadSqlTableWithWarnings(sql: string, tableNames: string[]): {
  data: SqlTableData | null;
  warnings: string[];
} {
  const allWarnings: string[] = [];
  for (const name of tableNames) {
    const { tables, warnings } = parseMysqlInsertsSafe(sql, name);
    allWarnings.push(...warnings);
    const merged = mergeSqlTables(tables);
    if (merged && merged.rows.length) return { data: merged, warnings: allWarnings };
  }
  return { data: null, warnings: allWarnings };
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
  phase2?: MigrationPhase2Data,
  typeMap?: Map<string, { type: "LIVE" | "MOVIE" | "SERIES"; isRadio?: boolean }>
): MigrationBundle {
  const lineIdToUsername = lineIdMapFromLines(tables.lines);
  return {
    source,
    streams: mapStreams(tables.streams, source, typeMap),
    bouquets: mapBouquets(tables.bouquets),
    lines: mapLines(tables.lines),
    resellers: tables.resellers ? mapResellers(tables.resellers) : [],
    magDevices: tables.mag ? mapMag(tables.mag, lineIdToUsername) : [],
    enigmaDevices: tables.enigma ? mapEnigma(tables.enigma, lineIdToUsername) : [],
    packages: phase2?.packages ?? [],
    phase2,
  };
}

function summarizeTables(
  allTables: Map<string, SqlTableData[]>
): { name: string; rows: number; hasColumns: boolean }[] {
  return Array.from(allTables.entries()).map(([name, chunks]) => {
    const merged = mergeSqlTables(chunks);
    return {
      name,
      rows: merged?.rows.length ?? 0,
      hasColumns: (merged?.columns.length ?? 0) > 0,
    };
  });
}

function warnIfUnmapped(bundle: MigrationBundle, tablesFound: { name: string; rows: number; hasColumns: boolean }[], warnings: string[]) {
  const totalMapped =
    bundle.streams.length +
    bundle.bouquets.length +
    bundle.lines.length +
    (bundle.resellers?.length ?? 0) +
    (bundle.magDevices?.length ?? 0) +
    (bundle.enigmaDevices?.length ?? 0);
  const hasData = tablesFound.some((t) => t.rows > 0);
  if (totalMapped === 0 && hasData) {
    const headerless = tablesFound.some((t) => t.rows > 0 && !t.hasColumns);
    if (headerless) {
      warnings.push(
        "Detected table data but 0 rows could be mapped — the dump's INSERT statements appear to omit column names (e.g. `INSERT INTO table VALUES (...)`). Re-export WITH column names: use a standard mysqldump or phpMyAdmin 'Complete insert' export."
      );
    } else {
      warnings.push(
        "Detected table data but 0 rows matched the expected columns for the selected panel type — the source schema may differ."
      );
    }
  }
}

export function bundleFromSql(sql: string, source: MigrationSource): MigrationBundle {
  const profile = PANEL_PROFILES[source];
  const warnings: string[] = [];

  // Single-pass parse — O(n) instead of O(n×m)
  const allTables = parseAllMysqlInserts(sql);
  const createColumns = parseCreateTableColumns(sql);

  // Headerless dumps (INSERT … VALUES without column names) yield empty
  // columns; infer them by content / CREATE TABLE so rows actually map.
  warnings.push(...applyHeaderlessInference(allTables, source, createColumns));

  function findTable(names: string[]): SqlTableData | null {
    for (const name of names) {
      const chunks = allTables.get(name.toLowerCase()) ?? [];
      const merged = mergeSqlTables(chunks);
      if (merged && merged.rows.length) return merged;
    }
    return null;
  }

  function findTableWithWarnings(names: string[]): { data: SqlTableData | null; warnings: string[] } {
    const notFound: string[] = [];
    for (const name of names) {
      const chunks = allTables.get(name.toLowerCase()) ?? [];
      if (!chunks.length) {
        notFound.push(name);
        continue;
      }
      const merged = mergeSqlTables(chunks);
      if (merged && merged.rows.length) return { data: merged, warnings: [] };
      return { data: null, warnings: [`Table "${name}" matched but contained no rows`] };
    }
    return {
      data: null,
      warnings: [
        `No INSERT statements found for any of these tables: ${notFound.map((n) => `"${n}"`).join(", ")}`,
      ],
    };
  }

  const streamsResult = findTableWithWarnings(profile.streams);
  const bouquetsResult = findTableWithWarnings(profile.bouquets);
  const linesResult = findTableWithWarnings(profile.lines);
  warnings.push(...streamsResult.warnings, ...bouquetsResult.warnings, ...linesResult.warnings);

  // Profiles put reg_users before users; never take a lines-table name when a
  // dedicated reseller table exists.
  const lineNames = new Set(profile.lines.map((n) => n.toLowerCase()));
  let resellersTable: SqlTableData | null = null;
  for (const name of profile.resellers) {
    const key = name.toLowerCase();
    const merged = mergeSqlTables(allTables.get(key) ?? []);
    if (!merged?.rows.length) continue;
    if (lineNames.has(key)) {
      const hasDedicated = profile.resellers.some((n) => {
        const k = n.toLowerCase();
        if (lineNames.has(k)) return false;
        return Boolean(mergeSqlTables(allTables.get(k) ?? [])?.rows.length);
      });
      if (hasDedicated) continue;
    }
    resellersTable = merged;
    break;
  }

  const magTable = findTable(profile.mag);
  const enigmaTable = findTable(profile.enigma);

  const sysEnrich = enrichStreamsFromSys(allTables, streamsResult.data);
  warnings.push(...sysEnrich.warnings);

  const junction = enrichSqlTablesFromJunctions(
    allTables,
    bouquetsResult.data,
    linesResult.data
  );
  warnings.push(...junction.warnings);

  const typeMap = loadStreamsTypeMap(allTables);
  const bundle = buildMigrationBundle(
    {
      streams: sysEnrich.streams,
      bouquets: junction.bouquets,
      lines: junction.lines,
      resellers: resellersTable,
      mag: magTable,
      enigma: enigmaTable,
    },
    source,
    loadPhase2FromSql(allTables, source),
    typeMap
  );
  {
    const streamRows = sysEnrich.streams?.rows.length ?? 0;
    const pending = bundle.streams.filter((s) => isPendingStreamUrl(s.streamUrl)).length;
    if (streamRows && bundle.streams.length < streamRows) {
      warnings.push(
        `Mapped ${bundle.streams.length} of ${streamRows} stream row(s); ${streamRows - bundle.streams.length} skipped (missing id/name).`
      );
    }
    if (pending) {
      warnings.push(
        `${pending} stream(s) had no playable URL in the dump (empty stream_source and no streams_servers current_source) — imported as pending:// placeholders so bouquets/episodes stay linked. Re-export streams_servers with the dump or fix URLs after import.`
      );
    }
  }

  const seriesEp = mapSeriesEpisodesFromSql(allTables, source, bundle.streams);
  if (seriesEp.streams.length) {
    bundle.streams.push(...seriesEp.streams);
  }
  warnings.push(...seriesEp.warnings);
  finalizeVodStreamDefaults(bundle.streams);

  // Stable sort: respect source order column so lists match the old panel
  bundle.streams.sort((a, b) => {
    const ao = Number.isFinite(a.sortOrder) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b.sortOrder) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return String(a.legacyId).localeCompare(String(b.legacyId), undefined, { numeric: true });
  });

  const live = bundle.streams.filter((s) => s.type === "LIVE" && !s.isRadio).length;
  const movies = bundle.streams.filter((s) => s.type === "MOVIE").length;
  const episodes = bundle.streams.filter(
    (s) => s.type === "SERIES" && (s.episodeNum != null || s.seasonNum != null)
  ).length;
  const seriesShows = new Set(
    bundle.streams
      .filter((s) => s.type === "SERIES" && s.seriesName)
      .map((s) => s.seriesName!.toLowerCase())
  ).size;
  warnings.push(
    `Content breakdown: ${live} live, ${movies} movies, ${seriesShows} TV series, ${episodes} TV episodes.`
  );

  const phase3Out = loadPhase3FromSql(allTables, source);
  bundle.phase3 = phase3Out.phase3;
  if (sysEnrich.onDemandStreamLegacyIds.length && bundle.phase3) {
    const set = new Set([
      ...(bundle.phase3.onDemandStreamLegacyIds ?? []),
      ...sysEnrich.onDemandStreamLegacyIds,
    ]);
    bundle.phase3.onDemandStreamLegacyIds = [...set];
  }
  warnings.push(...phase3Out.warnings);

  const tablesFound = summarizeTables(allTables);
  bundle.tablesFound = tablesFound;
  warnIfUnmapped(bundle, tablesFound, warnings);

  if (warnings.length) {
    bundle.warnings = [...(bundle.warnings ?? []), ...warnings];
  }

  return bundle;
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
        backupUrl: row.backupUrl ? String(row.backupUrl) : undefined,
        extraSourceUrls: Array.isArray(row.extraSourceUrls)
          ? (row.extraSourceUrls as unknown[]).map(String).filter(Boolean)
          : undefined,
        type: (row.type as MigrationStreamRow["type"]) ?? "LIVE",
        streamIcon: row.streamIcon ? String(row.streamIcon) : undefined,
        categoryLegacyId: row.categoryLegacyId ? String(row.categoryLegacyId) : undefined,
        categoryName: row.categoryName ? String(row.categoryName) : undefined,
        epgChannelId: row.epgChannelId ? String(row.epgChannelId) : undefined,
        channelId: row.channelId ? String(row.channelId) : undefined,
        containerExtension: row.containerExtension ? String(row.containerExtension) : undefined,
        isActive: row.isActive !== false,
        sortOrder: Number(row.sortOrder ?? 0) || undefined,
      };
    }),
    lines: pick("lines").map((l) => {
      const row = l as Record<string, unknown>;
      // Parse bouquet from JSON array string (e.g. '[1,3,4,5]') to string[]
      let bouquetIds: string[] = (row.bouquetLegacyIds as string[]) ?? [];
      if (!bouquetIds.length && row.bouquet) {
        try {
          const raw = String(row.bouquet);
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) bouquetIds = parsed.map(String);
        } catch { /* not JSON, ignore */ }
      }
      // Derive status from enabled/banned flags
      let status: MigrationLineRow["status"] = (row.status as any) ?? "ACTIVE";
      if (status === "ACTIVE") {
        const enabled = row.enabled ?? row.is_enabled;
        const banned = row.is_banned;
        if (enabled === 0 || enabled === false) status = "DISABLED";
        else if (banned === 1 || banned === true) status = "BANNED";
      }
      return {
        legacyId: row.legacyId ? String(row.legacyId) : row.id ? String(row.id) : undefined,
        username: String(row.username ?? ""),
        password: String(row.password ?? ""),
        expiresAt: row.expiresAt
          ? new Date(String(row.expiresAt))
          : unixToDate(row.exp_date),
        maxConnections: Number(row.maxConnections ?? row.max_connections ?? 1),
        status,
        bouquetLegacyIds: bouquetIds,
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
    phase3: obj.phase3 as MigrationPhase3Data | undefined,
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

/** Stream-parse a SQL dump file (memory-efficient for large files). */
export async function bundleFromSqlFile(
  filePath: string,
  source: MigrationSource,
  onProgress?: (bytesRead: number, totalBytes: number) => void
): Promise<MigrationBundle> {
  const profile = PANEL_PROFILES[source];
  const warnings: string[] = [];

  const { tables: allTables, createColumns } = await parseSqlDumpFile(filePath, onProgress);

  warnings.push(...applyHeaderlessInference(allTables, source, createColumns));

  function findTable(names: string[]): SqlTableData | null {
    for (const name of names) {
      const chunks = allTables.get(name.toLowerCase()) ?? [];
      const merged = mergeSqlTables(chunks);
      if (merged && merged.rows.length) return merged;
    }
    return null;
  }

  function findTableWithWarnings(names: string[]): { data: SqlTableData | null; warnings: string[] } {
    const notFound: string[] = [];
    for (const name of names) {
      const chunks = allTables.get(name.toLowerCase()) ?? [];
      if (!chunks.length) {
        notFound.push(name);
        continue;
      }
      const merged = mergeSqlTables(chunks);
      if (merged && merged.rows.length) return { data: merged, warnings: [] };
      return { data: null, warnings: [`Table "${name}" matched but contained no rows`] };
    }
    return {
      data: null,
      warnings: [
        `No INSERT statements found for any of these tables: ${notFound.map((n) => `"${n}"`).join(", ")}`,
      ],
    };
  }

  const streamsResult = findTableWithWarnings(profile.streams);
  const bouquetsResult = findTableWithWarnings(profile.bouquets);
  const linesResult = findTableWithWarnings(profile.lines);
  warnings.push(...streamsResult.warnings, ...bouquetsResult.warnings, ...linesResult.warnings);

  const lineNames = new Set(profile.lines.map((n) => n.toLowerCase()));
  let resellersTable: SqlTableData | null = null;
  for (const name of profile.resellers) {
    const key = name.toLowerCase();
    const merged = mergeSqlTables(allTables.get(key) ?? []);
    if (!merged?.rows.length) continue;
    if (lineNames.has(key)) {
      const hasDedicated = profile.resellers.some((n) => {
        const k = n.toLowerCase();
        if (lineNames.has(k)) return false;
        return Boolean(mergeSqlTables(allTables.get(k) ?? [])?.rows.length);
      });
      if (hasDedicated) continue;
    }
    resellersTable = merged;
    break;
  }

  const magTable = findTable(profile.mag);
  const enigmaTable = findTable(profile.enigma);

  const sysEnrich = enrichStreamsFromSys(allTables, streamsResult.data);
  warnings.push(...sysEnrich.warnings);

  const junction = enrichSqlTablesFromJunctions(
    allTables,
    bouquetsResult.data,
    linesResult.data
  );
  warnings.push(...junction.warnings);

  const typeMap = loadStreamsTypeMap(allTables);
  const bundle = buildMigrationBundle(
    {
      streams: sysEnrich.streams,
      bouquets: junction.bouquets,
      lines: junction.lines,
      resellers: resellersTable,
      mag: magTable,
      enigma: enigmaTable,
    },
    source,
    loadPhase2FromSql(allTables, source),
    typeMap
  );
  {
    const streamRows = sysEnrich.streams?.rows.length ?? 0;
    const pending = bundle.streams.filter((s) => isPendingStreamUrl(s.streamUrl)).length;
    if (streamRows && bundle.streams.length < streamRows) {
      warnings.push(
        `Mapped ${bundle.streams.length} of ${streamRows} stream row(s); ${streamRows - bundle.streams.length} skipped (missing id/name).`
      );
    }
    if (pending) {
      warnings.push(
        `${pending} stream(s) had no playable URL in the dump (empty stream_source and no streams_servers current_source) — imported as pending:// placeholders so bouquets/episodes stay linked. Re-export streams_servers with the dump or fix URLs after import.`
      );
    }
  }

  const seriesEp = mapSeriesEpisodesFromSql(allTables, source, bundle.streams);
  if (seriesEp.streams.length) {
    bundle.streams.push(...seriesEp.streams);
  }
  warnings.push(...seriesEp.warnings);
  finalizeVodStreamDefaults(bundle.streams);

  // Stable sort: respect source order column so lists match the old panel
  bundle.streams.sort((a, b) => {
    const ao = Number.isFinite(a.sortOrder) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b.sortOrder) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return String(a.legacyId).localeCompare(String(b.legacyId), undefined, { numeric: true });
  });

  const live = bundle.streams.filter((s) => s.type === "LIVE" && !s.isRadio).length;
  const movies = bundle.streams.filter((s) => s.type === "MOVIE").length;
  const episodes = bundle.streams.filter(
    (s) => s.type === "SERIES" && (s.episodeNum != null || s.seasonNum != null)
  ).length;
  const seriesShows = new Set(
    bundle.streams
      .filter((s) => s.type === "SERIES" && s.seriesName)
      .map((s) => s.seriesName!.toLowerCase())
  ).size;
  warnings.push(
    `Content breakdown: ${live} live, ${movies} movies, ${seriesShows} TV series, ${episodes} TV episodes.`
  );

  const phase3Out = loadPhase3FromSql(allTables, source);
  bundle.phase3 = phase3Out.phase3;
  if (sysEnrich.onDemandStreamLegacyIds.length && bundle.phase3) {
    const set = new Set([
      ...(bundle.phase3.onDemandStreamLegacyIds ?? []),
      ...sysEnrich.onDemandStreamLegacyIds,
    ]);
    bundle.phase3.onDemandStreamLegacyIds = [...set];
  }
  warnings.push(...phase3Out.warnings);

  const tablesFound = summarizeTables(allTables);
  bundle.tablesFound = tablesFound;
  warnIfUnmapped(bundle, tablesFound, warnings);

  if (warnings.length) {
    bundle.warnings = [...(bundle.warnings ?? []), ...warnings];
  }

  return bundle;
}
