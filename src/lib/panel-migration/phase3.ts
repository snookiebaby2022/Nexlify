/**
 * Map extended panel tables → MigrationPhase3Data for all SQL / PG sources:
 * providers, watch folders/logs, tickets, full EPG guide, ASNs, logs, stats, settings.
 *
 * Table-name aliases cover XUI.one, StreamCreed, Xtream Codes / Xtream UI, NXT-DASH,
 * Midnight, and 1-stream / Nexlify-style schemas when those tables exist in the dump.
 */

import { mergeSqlTables, rowToRecord, type SqlTableData } from "./sql-parse";
import type { MigrationPhase3Data, MigrationSource } from "./types";
import { PHASE3_TABLE_ALIASES, type Phase3AliasKind } from "./profiles";

const LOG_CAP = 2500;
const EPG_PROGRAM_CAP = 100_000;
const WATCH_LOG_CAP = 500;
const STATS_CAP = 500;
const LIVE_CONN_CAP = 500;
const EPG_API_CAP = 50_000;
const WATCH_REFRESH_CAP = 500;
const CREDIT_LOG_CAP = 2000;

function aliasesFor(source: MigrationSource | undefined, kind: Phase3AliasKind): string[] {
  const shared = PHASE3_TABLE_ALIASES.shared[kind] ?? [];
  if (!source || source === "nexlify_json") return [...shared];
  const extra = PHASE3_TABLE_ALIASES.bySource[source]?.[kind] ?? [];
  // Prefer source-specific names first (e.g. streams_providers on Xtream UI).
  return [...extra, ...shared.filter((n) => !extra.includes(n))];
}

function findMerged(
  allTables: Map<string, SqlTableData[]>,
  names: string[]
): SqlTableData | null {
  for (const name of names) {
    const chunks = allTables.get(name.toLowerCase()) ?? [];
    const merged = mergeSqlTables(chunks);
    if (merged && merged.rows.length) return merged;
  }
  return null;
}

function unixToDate(val: unknown): Date | undefined {
  if (val == null || val === "") return undefined;
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  const n = Number(val);
  if (Number.isFinite(n) && n > 0) {
    const ms = n > 1e12 ? n : n < 1e11 ? n * 1000 : n;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(String(val));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function buildProviderBaseUrl(r: Record<string, unknown>): string {
  const explicit = String(
    r.url ?? r.base_url ?? r.provider_dns ?? r.dns ?? r.provider_url ?? ""
  ).trim();
  if (/^https?:\/\//i.test(explicit)) return explicit;
  const host = String(
    r.server ?? r.server_ip ?? r.ip ?? r.host ?? r.provider_dns ?? explicit
  ).trim();
  if (!host) return "";
  if (/^https?:\/\//i.test(host)) return host;
  const port = Number(r.port ?? r.http_port ?? 0) || 0;
  const ssl = Number(r.https ?? r.ssl ?? r.is_https ?? 0) === 1;
  const scheme = ssl ? "https" : "http";
  return port && port !== 80 && port !== 443
    ? `${scheme}://${host}:${port}`
    : `${scheme}://${host}`;
}

function mapTicketStatus(val: unknown): "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" {
  const s = String(val ?? "").toLowerCase();
  const n = Number(val);
  // Classic XC/XUI: status 1 ≈ open, 2/3 ≈ closed (do not treat 1 as in-progress).
  if (s.includes("close") || n === 2 || n === 3) return "CLOSED";
  if (s.includes("resolv") || n === 4) return "RESOLVED";
  if (s.includes("progress") || s.includes("reply") || s.includes("answered")) {
    return "IN_PROGRESS";
  }
  return "OPEN";
}

function mapWatchType(val: unknown): "MOVIE" | "SERIES" | "M3U" | "MIXED" {
  const s = String(val ?? "").toLowerCase();
  if (s.includes("movie") || s === "vod" || s === "1") return "MOVIE";
  if (s.includes("series") || s === "2") return "SERIES";
  if (s.includes("m3u")) return "M3U";
  return "MIXED";
}

export function settingsKeyForSource(source?: MigrationSource): string {
  const id = source && source !== "nexlify_json" ? source : "panel";
  return `migration.${id}_settings`;
}

export function loadPhase3FromSql(
  allTables: Map<string, SqlTableData[]>,
  source: MigrationSource = "xui"
): { phase3: MigrationPhase3Data; warnings: string[] } {
  const warnings: string[] = [];
  const phase3: MigrationPhase3Data = {
    providers: [],
    providerStreamLinks: [],
    watchFolders: [],
    watchLogs: [],
    tickets: [],
    epgChannels: [],
    epgPrograms: [],
    blockedAsns: [],
    activityLogs: [],
    bandwidthSnapshots: [],
    accessCodes: [],
    blockedUserAgents: [],
    userGroups: [],
    liveConnections: [],
    onDemandStreamLegacyIds: [],
    watchCategories: [],
    watchRefresh: [],
    epgApiChannels: [],
    epgLanguages: [],
    crontab: [],
    profiles: [],
    creditLogs: [],
    streamOptions: [],
    streamArguments: [],
    streamErrors: [],
    extraTableBlobs: {},
  };

  const find = (kind: Phase3AliasKind) => findMerged(allTables, aliasesFor(source, kind));

  // --- providers ---
  const providers = find("providers");
  if (providers) {
    for (const row of providers.rows) {
      const r = rowToRecord(providers.columns, row);
      const legacyId = String(r.id ?? r.provider_id ?? "");
      const name = String(
        r.name ?? r.provider_name ?? r.title ?? `Provider ${legacyId}`
      ).trim();
      const baseUrl = buildProviderBaseUrl(r);
      if (!legacyId || !name || !baseUrl) continue;
      const user = String(r.username ?? r.user ?? "").trim();
      const pass = String(r.password ?? r.pass ?? "").trim();
      phase3.providers.push({
        legacyId,
        name,
        baseUrl,
        apiKey: user && pass ? `${user}:${pass}` : user || undefined,
        providerType:
          Number(r.legacy_xc ?? 0) === 1
            ? "xtream_vod"
            : Number(r.is_live ?? 0) === 1
              ? "live_upstream"
              : "generic_url",
        notes: r.notes ? String(r.notes) : undefined,
        isActive: Number(r.enabled ?? r.status ?? r.is_active ?? 1) !== 0,
      });
    }
  }
  const pStreams = find("providerStreams");
  if (pStreams) {
    for (const row of pStreams.rows) {
      const r = rowToRecord(pStreams.columns, row);
      const providerLegacyId = String(
        r.provider_id ?? r.providers_id ?? r.stream_provider_id ?? ""
      );
      const streamLegacyId = String(r.stream_id ?? r.streams_id ?? "");
      if (!providerLegacyId || !streamLegacyId) continue;
      phase3.providerStreamLinks.push({
        providerLegacyId,
        streamLegacyId,
        providerPath: r.path
          ? String(r.path)
          : r.provider_path
            ? String(r.provider_path)
            : undefined,
      });
    }
  }

  // --- watch folders / logs ---
  const folders = find("watchFolders");
  if (folders) {
    for (const row of folders.rows) {
      const r = rowToRecord(folders.columns, row);
      const legacyId = String(r.id ?? "");
      const path = String(
        r.directory ?? r.folder ?? r.path ?? r.m3u ?? r.url ?? ""
      ).trim();
      const name = String(r.name ?? r.folder_name ?? path ?? `Watch ${legacyId}`).trim();
      if (!legacyId || !path) continue;
      phase3.watchFolders.push({
        legacyId,
        name: name || `Watch ${legacyId}`,
        path,
        type: mapWatchType(r.type ?? r.folder_type ?? r.category_type),
        categoryLegacyId:
          r.category_id != null && String(r.category_id) !== "0"
            ? String(r.category_id)
            : undefined,
        serverLegacyId:
          r.server_id != null && String(r.server_id) !== "0"
            ? String(r.server_id)
            : undefined,
        isActive: Number(r.enabled ?? r.active ?? r.is_active ?? 1) !== 0,
        isAdult: Number(r.is_adult ?? r.adult ?? 0) === 1,
        autoScanMins: Math.max(
          0,
          Number(r.auto_scan ?? r.auto_scan_mins ?? r.scan_seconds ?? r.interval ?? 0) || 0
        ),
        lastScan: unixToDate(r.last_run ?? r.last_scan ?? r.updated),
        importedCount: Number(r.imported ?? r.imported_count ?? 0) || 0,
      });
    }
  }
  const wLogs = find("watchLogs");
  if (wLogs) {
    let n = 0;
    for (const row of wLogs.rows) {
      if (n >= WATCH_LOG_CAP) break;
      const r = rowToRecord(wLogs.columns, row);
      const sourcePath = String(
        r.directory ?? r.folder ?? r.path ?? r.source ?? r.message ?? r.action ?? "watch"
      ).trim();
      if (!sourcePath) continue;
      phase3.watchLogs.push({
        source: sourcePath.slice(0, 500),
        status: String(r.status ?? r.result ?? "done"),
        imported: Number(r.imported ?? r.added ?? 0) || 0,
        skipped: Number(r.skipped ?? r.failed ?? 0) || 0,
        message: r.message ? String(r.message).slice(0, 1000) : undefined,
        watchFolderLegacyId:
          r.folder_id != null
            ? String(r.folder_id)
            : r.watch_folder_id != null
              ? String(r.watch_folder_id)
              : undefined,
        createdAt: unixToDate(r.date ?? r.created ?? r.created_at ?? r.timestamp ?? r.time),
      });
      n++;
    }
    if (wLogs.rows.length > WATCH_LOG_CAP) {
      warnings.push(
        `Capped watch_logs import at ${WATCH_LOG_CAP} of ${wLogs.rows.length} rows.`
      );
    }
  }

  // --- tickets ---
  const tickets = find("tickets");
  const replies = find("ticketReplies");
  const repliesByTicket = new Map<
    string,
    { body: string; authorLegacyId?: string; createdAt?: Date }[]
  >();
  if (replies) {
    for (const row of replies.rows) {
      const r = rowToRecord(replies.columns, row);
      const tid = String(r.ticket_id ?? r.tickets_id ?? "");
      const body = String(r.message ?? r.body ?? r.reply ?? "").trim();
      if (!tid || !body) continue;
      const list = repliesByTicket.get(tid) ?? [];
      list.push({
        body,
        authorLegacyId:
          r.admin_id != null
            ? String(r.admin_id)
            : r.user_id != null
              ? String(r.user_id)
              : r.member_id != null
                ? String(r.member_id)
                : r.author_id != null
                  ? String(r.author_id)
                  : undefined,
        createdAt: unixToDate(r.date ?? r.created ?? r.created_at ?? r.timestamp),
      });
      repliesByTicket.set(tid, list);
    }
  }
  if (tickets) {
    for (const row of tickets.rows) {
      const r = rowToRecord(tickets.columns, row);
      const legacyId = String(r.id ?? "");
      const subject = String(r.subject ?? r.title ?? `Ticket ${legacyId}`).trim();
      const body = String(r.message ?? r.body ?? r.description ?? subject).trim();
      if (!legacyId || !subject) continue;
      const ticketReplies = repliesByTicket.get(legacyId) ?? [];
      // Classic XC tickets have no body — use first reply text when present.
      const resolvedBody =
        body && body !== subject
          ? body
          : ticketReplies[0]?.body
            ? ticketReplies[0].body
            : subject;
      phase3.tickets.push({
        legacyId,
        subject,
        body: resolvedBody,
        status: mapTicketStatus(r.status ?? r.state),
        priority: "NORMAL",
        category: "SUPPORT",
        createdByLegacyId:
          r.member_id != null
            ? String(r.member_id)
            : r.user_id != null
              ? String(r.user_id)
              : r.created_by_id != null
                ? String(r.created_by_id)
                : r.admin_id != null
                  ? String(r.admin_id)
                  : undefined,
        assignedToLegacyId:
          r.assigned_to_id != null
            ? String(r.assigned_to_id)
            : r.admin_read != null && Number(r.admin_read) > 0
              ? String(r.admin_id ?? "")
              : undefined,
        lineLegacyId:
          r.line_id != null && String(r.line_id) !== "0" ? String(r.line_id) : undefined,
        createdAt: unixToDate(r.date ?? r.created ?? r.created_at ?? r.timestamp),
        replies: ticketReplies,
      });
    }
  }

  // --- EPG channels + programs ---
  const epgChannels = find("epgChannels");
  if (epgChannels) {
    for (const row of epgChannels.rows) {
      const r = rowToRecord(epgChannels.columns, row);
      const channelId = String(r.channel_id ?? r.epg_id ?? r.id ?? "").trim();
      if (!channelId) continue;
      phase3.epgChannels.push({
        sourceLegacyId:
          r.epg_id != null && String(r.epg_id) !== channelId
            ? String(r.epg_id)
            : r.source_id != null
              ? String(r.source_id)
              : undefined,
        channelId,
        name: r.name ? String(r.name) : r.channel_name ? String(r.channel_name) : undefined,
        icon: r.icon ? String(r.icon) : r.image ? String(r.image) : undefined,
      });
    }
  }
  const epgData = find("epgPrograms");
  if (epgData) {
    let n = 0;
    for (const row of epgData.rows) {
      if (n >= EPG_PROGRAM_CAP) break;
      const r = rowToRecord(epgData.columns, row);
      const channelId = String(r.channel ?? r.channel_id ?? r.epg_id ?? "").trim();
      const title = String(r.title ?? r.name ?? "").trim();
      const start = unixToDate(r.start ?? r.start_timestamp ?? r.begin ?? r.start_at);
      const stop = unixToDate(r.end ?? r.stop ?? r.stop_timestamp ?? r.finish ?? r.end_at);
      if (!channelId || !title || !start || !stop) continue;
      phase3.epgPrograms.push({
        sourceLegacyId: r.epg_id != null ? String(r.epg_id) : r.source_id != null ? String(r.source_id) : undefined,
        channelId,
        title,
        description: r.description
          ? String(r.description)
          : r.desc
            ? String(r.desc)
            : undefined,
        start,
        stop,
      });
      n++;
    }
    if (epgData.rows.length > EPG_PROGRAM_CAP) {
      warnings.push(
        `Capped epg_data import at ${EPG_PROGRAM_CAP} of ${epgData.rows.length} programmes.`
      );
    }
  }

  // --- blocked ASNs ---
  const asns = find("blockedAsns");
  if (asns) {
    for (const row of asns.rows) {
      const r = rowToRecord(asns.columns, row);
      const asn = String(r.asn ?? r.as_number ?? r.asn_number ?? r.id ?? "").trim();
      if (!asn || !/^\d+$/.test(asn.replace(/^AS/i, ""))) continue;
      phase3.blockedAsns.push({
        asn: asn.replace(/^AS/i, ""),
        label: r.name
          ? String(r.name)
          : r.isp
            ? String(r.isp)
            : r.label
              ? String(r.label)
              : undefined,
        reason: r.notes ? String(r.notes) : r.reason ? String(r.reason) : undefined,
        isActive: Number(r.enabled ?? r.active ?? r.is_active ?? 1) !== 0,
      });
    }
  }

  // --- activity logs (capped) ---
  const logSpecs: { kind: Phase3AliasKind; action: string; entity?: string }[] = [
    { kind: "panelLogs", action: `${source}_panel` },
    { kind: "lineLogs", action: `${source}_line`, entity: "line" },
    { kind: "userLogs", action: `${source}_user`, entity: "user" },
    { kind: "loginLogs", action: `${source}_login` },
    { kind: "streamLogs", action: `${source}_stream`, entity: "stream" },
  ];
  for (const spec of logSpecs) {
    const table = find(spec.kind);
    if (!table) continue;
    let n = 0;
    for (const row of table.rows) {
      if (n >= LOG_CAP) break;
      const r = rowToRecord(table.columns, row);
      phase3.activityLogs.push({
        action: spec.action,
        entity: spec.entity,
        entityId: r.stream_id
          ? String(r.stream_id)
          : r.line_id
            ? String(r.line_id)
            : r.user_id
              ? String(r.user_id)
              : undefined,
        meta: { ...r, _sourceTable: aliasesFor(source, spec.kind)[0] },
        createdAt: unixToDate(
          r.date ?? r.created ?? r.created_at ?? r.timestamp ?? r.time
        ),
      });
      n++;
    }
    if (table.rows.length > LOG_CAP) {
      warnings.push(
        `Capped ${aliasesFor(source, spec.kind)[0]} import at ${LOG_CAP} of ${table.rows.length} rows.`
      );
    }
  }

  // --- stats → bandwidth snapshots ---
  const sStats = find("serverStats");
  if (sStats) {
    let n = 0;
    for (const row of sStats.rows) {
      if (n >= STATS_CAP) break;
      const r = rowToRecord(sStats.columns, row);
      phase3.bandwidthSnapshots.push({
        bytesIn: Number(r.bytes_received ?? r.bytes_in ?? r.network_rx ?? r.bytesIn ?? 0) || 0,
        bytesOut: Number(r.bytes_sent ?? r.bytes_out ?? r.network_tx ?? r.bytesOut ?? 0) || 0,
        connections:
          Number(r.connections ?? r.clients ?? r.total_clients ?? r.connection_count ?? 0) || 0,
        createdAt: unixToDate(
          r.time ?? r.date ?? r.created ?? r.created_at ?? r.timestamp ?? r.captured_at
        ),
      });
      n++;
    }
  }

  // --- settings (single row JSON blob) ---
  const settings = find("settings");
  if (settings?.rows.length) {
    const r = rowToRecord(settings.columns, settings.rows[0]);
    const raw: Record<string, unknown> = { _migrationSource: source };
    for (const [k, v] of Object.entries(r)) {
      const s = v == null ? "" : String(v);
      if (s.length > 5000) raw[k] = `[truncated ${s.length} chars]`;
      else raw[k] = v;
    }
    phase3.settingsRaw = raw;
  }

  // --- extras: access codes ---
  const accessCodes = find("accessCodes");
  if (accessCodes) {
    for (const row of accessCodes.rows) {
      const r = rowToRecord(accessCodes.columns, row);
      const code = String(r.code ?? r.access_code ?? r.key ?? "").trim();
      if (!code) continue;
      const typeHint = r.type != null ? String(r.type) : "";
      const groupsHint = r.groups != null ? String(r.groups) : "";
      phase3.accessCodes.push({
        code: code.slice(0, 128),
        packageLegacyId:
          r.package_id != null && String(r.package_id) !== "0"
            ? String(r.package_id)
            : undefined,
        bouquetLegacyIds: undefined,
        days: Number(r.days ?? r.duration ?? r.length_days ?? 30) || 30,
        maxConnections: Math.max(1, Number(r.max_connections ?? r.connections ?? 1) || 1),
        maxUses: Math.max(0, Number(r.max_uses ?? r.uses_allowed ?? 1) || 1),
        uses: Math.max(0, Number(r.uses ?? r.used ?? 0) || 0),
        expiresAt: unixToDate(r.expires ?? r.exp_date ?? r.expire_at),
        isActive: Number(r.enabled ?? r.active ?? r.is_active ?? 1) !== 0,
        notes: [typeHint && `type=${typeHint}`, groupsHint && `groups=${groupsHint}`]
          .filter(Boolean)
          .join("; ")
          .slice(0, 500) || undefined,
      });
    }
  }

  // --- extras: blocked user agents ---
  const blockedUas = find("blockedUserAgents");
  if (blockedUas) {
    for (const row of blockedUas.rows) {
      const r = rowToRecord(blockedUas.columns, row);
      const pattern = String(
        r.user_agent ?? r.ua ?? r.pattern ?? r.agent ?? r.blocked_ua ?? ""
      ).trim();
      if (!pattern) continue;
      phase3.blockedUserAgents.push({
        pattern: pattern.slice(0, 500),
        reason: r.reason ? String(r.reason).slice(0, 500) : undefined,
        isActive: Number(r.enabled ?? r.active ?? r.is_active ?? r.blocked ?? 1) !== 0,
      });
    }
  }

  // --- extras: user groups ---
  const groups = find("userGroups");
  if (groups) {
    for (const row of groups.rows) {
      const r = rowToRecord(groups.columns, row);
      const legacyId = String(r.id ?? r.group_id ?? "");
      const name = String(
        r.group_name ?? r.name ?? r.title ?? `Group ${legacyId}`
      ).trim();
      if (!legacyId || !name) continue;
      const config: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (["id", "group_id", "group_name", "name", "title"].includes(k)) continue;
        if (v == null) continue;
        const s = String(v);
        if (s.length > 2000) continue;
        config[k] = v;
      }
      phase3.userGroups.push({
        legacyId,
        name,
        description: r.description ? String(r.description).slice(0, 500) : undefined,
        isReseller: Number(r.is_reseller ?? r.reseller ?? 0) === 1,
        isBanned: Number(r.is_banned ?? r.banned ?? 0) === 1,
        sortOrder: Number(r.sort_order ?? r.order ?? r.id ?? 0) || 0,
        config,
      });
    }
  }

  // --- extras: live sessions (capped) ---
  const live = find("liveConnections");
  if (live) {
    let n = 0;
    for (const row of live.rows) {
      if (n >= LIVE_CONN_CAP) break;
      const r = rowToRecord(live.columns, row);
      const lineLegacyId =
        r.user_id != null
          ? String(r.user_id)
          : r.line_id != null
            ? String(r.line_id)
            : undefined;
      const lineUsername = r.username ? String(r.username).trim() : undefined;
      if (!lineLegacyId && !lineUsername) continue;
      phase3.liveConnections.push({
        lineLegacyId,
        lineUsername,
        streamLegacyId:
          r.stream_id != null && String(r.stream_id) !== "0"
            ? String(r.stream_id)
            : undefined,
        ip: r.user_ip ? String(r.user_ip) : r.ip ? String(r.ip) : undefined,
        userAgent: r.user_agent
          ? String(r.user_agent).slice(0, 500)
          : r.ua
            ? String(r.ua).slice(0, 500)
            : undefined,
        startedAt: unixToDate(r.date_start ?? r.started ?? r.started_at ?? r.date),
        lastSeenAt: unixToDate(r.date_end ?? r.last_seen ?? r.updated ?? r.date),
      });
      n++;
    }
    if (live.rows.length > LIVE_CONN_CAP) {
      warnings.push(
        `Capped live-session import at ${LIVE_CONN_CAP} of ${live.rows.length} rows.`
      );
    }
  }

  // --- extras: on-demand stream flags ---
  const onDemand = find("onDemandCheck");
  if (onDemand) {
    const ids = new Set<string>();
    for (const row of onDemand.rows) {
      const r = rowToRecord(onDemand.columns, row);
      const sid = String(r.stream_id ?? r.id ?? r.streams_id ?? "").trim();
      if (!sid || sid === "0") continue;
      ids.add(sid);
    }
    phase3.onDemandStreamLegacyIds = [...ids];
  }

  // --- extras: watch categories (also enrich watch folders) ---
  const watchCats = find("watchCategories");
  if (watchCats) {
    for (const row of watchCats.rows) {
      const r = rowToRecord(watchCats.columns, row);
      const categoryLegacyId =
        r.cat_id != null
          ? String(r.cat_id)
          : r.category_id != null
            ? String(r.category_id)
            : undefined;
      const folderLegacyId =
        r.folder_id != null
          ? String(r.folder_id)
          : r.watch_folder_id != null
            ? String(r.watch_folder_id)
            : undefined;
      phase3.watchCategories.push({
        legacyId: r.id != null ? String(r.id) : undefined,
        folderLegacyId,
        categoryLegacyId:
          categoryLegacyId && categoryLegacyId !== "0" ? categoryLegacyId : undefined,
        type: r.type != null ? String(r.type) : undefined,
        path: r.gen_folder
          ? String(r.gen_folder)
          : r.directory
            ? String(r.directory)
            : r.path
              ? String(r.path)
              : undefined,
      });
    }
    // Enrich watch folders missing category from watch_categories
    if (phase3.watchCategories.length && phase3.watchFolders.length) {
      for (const f of phase3.watchFolders) {
        if (f.categoryLegacyId) continue;
        const match =
          phase3.watchCategories.find((c) => c.folderLegacyId === f.legacyId) ||
          phase3.watchCategories.find(
            (c) => c.path && (c.path === f.path || f.path.includes(c.path))
          );
        if (match?.categoryLegacyId) f.categoryLegacyId = match.categoryLegacyId;
      }
    }
  }

  // --- extras: watch refresh (capped sample) ---
  const watchRefresh = find("watchRefresh");
  if (watchRefresh) {
    let n = 0;
    for (const row of watchRefresh.rows) {
      if (n >= WATCH_REFRESH_CAP) break;
      const r = rowToRecord(watchRefresh.columns, row);
      phase3.watchRefresh.push({
        streamLegacyId:
          r.stream_id != null && String(r.stream_id) !== "0"
            ? String(r.stream_id)
            : undefined,
        type: r.type != null ? String(r.type) : undefined,
        status: r.status != null ? String(r.status) : undefined,
        createdAt: unixToDate(r.date ?? r.created ?? r.created_at ?? r.timestamp),
        message: r.message ? String(r.message).slice(0, 500) : undefined,
      });
      n++;
    }
    if (watchRefresh.rows.length > WATCH_REFRESH_CAP) {
      warnings.push(
        `Capped watch_refresh import at ${WATCH_REFRESH_CAP} of ${watchRefresh.rows.length} rows (full count kept in settings blob).`
      );
      if (!phase3.settingsRaw) phase3.settingsRaw = { _migrationSource: source };
      phase3.settingsRaw.watch_refresh_total = watchRefresh.rows.length;
    }
  }

  // --- extras: epg_api channel / programme catalog (resilient column matching) ---
  const epgApi = find("epgApi");
  if (epgApi) {
    let n = 0;
    let asPrograms = 0;
    const cols = epgApi.columns.map((c) => c.toLowerCase());
    for (const row of epgApi.rows) {
      if (n >= EPG_API_CAP) break;
      const r = rowToRecord(epgApi.columns, row);
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          const v = r[k];
          if (v != null && String(v).trim() !== "" && String(v).trim() !== "0") {
            return String(v).trim();
          }
        }
        for (const [k, v] of Object.entries(r)) {
          if (keys.some((want) => k.includes(want.replace(/_/g, ""))) || keys.some((want) => k.includes(want))) {
            if (v != null && String(v).trim() !== "" && String(v).trim() !== "0") {
              return String(v).trim();
            }
          }
        }
        return "";
      };

      let channelId = pick(
        "channel_id",
        "epg_channel_id",
        "xmltv_id",
        "tvg_id",
        "channel",
        "ch_id",
        "stream_id",
        "id"
      );
      let name = pick(
        "name",
        "channel_name",
        "title",
        "display_name",
        "epg_name",
        "stream_display_name"
      );
      // Positional fallback when CREATE TABLE names don't match known aliases.
      if (!channelId) {
        const vals = row
          .map((v) => (v == null ? "" : String(v).trim()))
          .filter((v) => v !== "" && v !== "0" && v !== "NULL");
        if (vals.length) {
          channelId = vals[0].slice(0, 200);
          if (!name && vals.length > 1) name = vals[1].slice(0, 300);
        }
      }
      if (!channelId) continue;

      phase3.epgApiChannels.push({
        sourceLegacyId: pick("epg_id", "source_id", "epg") || undefined,
        channelId: channelId.slice(0, 200),
        name: name ? name.slice(0, 300) : undefined,
        icon: pick("icon", "logo", "image", "stream_icon")?.slice(0, 1000) || undefined,
        language: pick("lang", "language", "epg_lang") || undefined,
      });
      n++;

      // Some XUI epg_api rows are programmes (start/stop + title).
      const title = pick("title", "programme", "program", "name");
      const start = unixToDate(r.start ?? r.start_timestamp ?? r.date_start ?? r.begin);
      const stop = unixToDate(r.end ?? r.stop ?? r.stop_timestamp ?? r.date_end ?? r.finish);
      if (title && start && stop && stop > start && asPrograms < EPG_PROGRAM_CAP) {
        phase3.epgPrograms.push({
          sourceLegacyId: pick("epg_id", "source_id") || undefined,
          channelId: channelId.slice(0, 200),
          title: title.slice(0, 500),
          description: pick("description", "desc", "plot")?.slice(0, 4000) || undefined,
          start,
          stop,
        });
        asPrograms++;
      }
    }
    if (epgApi.rows.length > EPG_API_CAP) {
      warnings.push(
        `Capped epg_api import at ${EPG_API_CAP} of ${epgApi.rows.length} rows.`
      );
    }
    if (n === 0) {
      warnings.push(
        `epg_api: 0 rows mapped from ${epgApi.rows.length} (columns: ${cols.slice(0, 12).join(", ") || "none"}). Storing raw sample blob.`
      );
    } else {
      warnings.push(`Mapped ${n} epg_api channel row(s)${asPrograms ? `, ${asPrograms} as programmes` : ""}.`);
    }
    // Always keep a reviewable sample of the raw table.
    phase3.extraTableBlobs = phase3.extraTableBlobs ?? {};
    phase3.extraTableBlobs.epg_api = {
      total: epgApi.rows.length,
      mapped: n,
      columns: epgApi.columns,
      sample: epgApi.rows.slice(0, 50).map((row) => rowToRecord(epgApi.columns, row)),
    };
  }

  // --- extras: epg languages ---
  const epgLangs = find("epgLanguages");
  if (epgLangs) {
    for (const row of epgLangs.rows) {
      const r = rowToRecord(epgLangs.columns, row);
      const code = String(r.code ?? r.lang ?? r.language_code ?? r.id ?? "").trim();
      if (!code) continue;
      phase3.epgLanguages.push({
        code: code.slice(0, 32),
        name: r.language
          ? String(r.language)
          : r.name
            ? String(r.name)
            : r.language_name
              ? String(r.language_name)
              : undefined,
        isActive: Number(r.enabled ?? r.active ?? r.is_active ?? 1) !== 0,
      });
    }
  }

  // --- extras: crontab definitions ---
  const crontab = find("crontab");
  if (crontab) {
    for (const row of crontab.rows) {
      const r = rowToRecord(crontab.columns, row);
      const command = String(
        r.command ?? r.cmd ?? r.job ?? r.script ?? r.description ?? ""
      ).trim();
      const time = String(r.time ?? r.schedule ?? r.cron ?? r.minute ?? "").trim();
      if (!command && !time) continue;
      phase3.crontab.push({
        time: time || undefined,
        command: command || undefined,
        enabled: Number(r.enabled ?? r.active ?? r.is_active ?? 1) !== 0,
      });
    }
  }

  // --- extras: transcoder profiles (stored for review) ---
  const profiles = find("profiles");
  if (profiles) {
    for (const row of profiles.rows) {
      const r = rowToRecord(profiles.columns, row);
      const name = String(
        r.profile_name ?? r.name ?? r.title ?? `Profile ${r.id ?? ""}`
      ).trim();
      if (!name) continue;
      phase3.profiles.push({
        legacyId: r.id != null ? String(r.id) : undefined,
        name,
        options: r.profile_options ?? r.options ?? r.data ?? r.config ?? undefined,
      });
    }
  }

  // --- extras: credit logs ---
  const creditLogs = find("creditLogs");
  if (creditLogs) {
    let n = 0;
    for (const row of creditLogs.rows) {
      if (n >= CREDIT_LOG_CAP) break;
      const r = rowToRecord(creditLogs.columns, row);
      const userLegacyId = String(r.target_id ?? r.user_id ?? r.admin_id ?? "").trim();
      const amount = Number(r.amount ?? r.credits ?? r.credit ?? NaN);
      if (!userLegacyId || !Number.isFinite(amount) || amount === 0) continue;
      phase3.creditLogs.push({
        userLegacyId,
        amount: Math.trunc(amount),
        note: r.reason
          ? String(r.reason).slice(0, 500)
          : r.notes
            ? String(r.notes).slice(0, 500)
            : undefined,
        createdAt: unixToDate(r.date ?? r.created ?? r.created_at ?? r.timestamp),
      });
      n++;
    }
    if (creditLogs.rows.length > CREDIT_LOG_CAP) {
      warnings.push(
        `Capped credit-log import at ${CREDIT_LOG_CAP} of ${creditLogs.rows.length} rows.`
      );
    }
  }

  // --- extras: stream options / arguments / errors ---
  const OPT_CAP = 5000;
  const streamOpts = find("streamOptions");
  if (streamOpts) {
    let n = 0;
    for (const row of streamOpts.rows) {
      if (n >= OPT_CAP) break;
      const r = rowToRecord(streamOpts.columns, row);
      phase3.streamOptions.push({
        streamLegacyId:
          r.stream_id != null && String(r.stream_id) !== "0"
            ? String(r.stream_id)
            : undefined,
        argumentLegacyId:
          r.argument_id != null
            ? String(r.argument_id)
            : r.option_id != null
              ? String(r.option_id)
              : undefined,
        key: r.name ? String(r.name) : r.argument ? String(r.argument) : undefined,
        value: r.value != null ? String(r.value).slice(0, 2000) : undefined,
      });
      n++;
    }
  }
  const streamArgs = find("streamArguments");
  if (streamArgs) {
    let n = 0;
    for (const row of streamArgs.rows) {
      if (n >= OPT_CAP) break;
      const r = rowToRecord(streamArgs.columns, row);
      phase3.streamArguments.push({
        argumentLegacyId: r.id != null ? String(r.id) : undefined,
        key: String(r.name ?? r.argument ?? r.key ?? "").trim() || undefined,
        value: r.value != null ? String(r.value).slice(0, 2000) : r.wargument != null ? String(r.wargument).slice(0, 2000) : undefined,
      });
      n++;
    }
  }
  const streamErrors = find("streamErrors");
  if (streamErrors) {
    let n = 0;
    for (const row of streamErrors.rows) {
      if (n >= LOG_CAP) break;
      const r = rowToRecord(streamErrors.columns, row);
      const message = String(
        r.error ?? r.message ?? r.msg ?? r.description ?? ""
      ).trim();
      if (!message) continue;
      phase3.streamErrors.push({
        streamLegacyId:
          r.stream_id != null && String(r.stream_id) !== "0"
            ? String(r.stream_id)
            : undefined,
        message: message.slice(0, 2000),
        createdAt: unixToDate(r.date ?? r.created ?? r.created_at ?? r.timestamp),
      });
      n++;
    }
  }

  // --- extras: output devices/formats, divergence, mysql syslog → blobs (+ syslog → logs) ---
  function tableBlob(kind: Phase3AliasKind, key: string, sample = 100) {
    const table = find(kind);
    if (!table?.rows.length) return;
    phase3.extraTableBlobs = phase3.extraTableBlobs ?? {};
    phase3.extraTableBlobs[key] = {
      total: table.rows.length,
      columns: table.columns,
      sample: table.rows.slice(0, sample).map((row) => rowToRecord(table.columns, row)),
    };
  }
  tableBlob("outputDevices", "output_devices");
  tableBlob("outputFormats", "output_formats");
  tableBlob("lineDivergence", "lines_divergence");

  const mysqlSyslog = find("mysqlSyslog");
  if (mysqlSyslog) {
    tableBlob("mysqlSyslog", "mysql_syslog");
    let n = 0;
    for (const row of mysqlSyslog.rows) {
      if (n >= 500) break;
      const r = rowToRecord(mysqlSyslog.columns, row);
      const message = String(
        r.message ?? r.msg ?? r.error ?? r.query ?? r.log ?? ""
      ).trim();
      if (!message) continue;
      phase3.activityLogs.push({
        action: "mysql_syslog",
        entity: "mysql",
        meta: r,
        createdAt: unixToDate(r.date ?? r.created ?? r.created_at ?? r.timestamp ?? r.time),
      });
      n++;
    }
  }

  // Also keep capped samples of options/args for review
  if (phase3.streamOptions.length) {
    phase3.extraTableBlobs = phase3.extraTableBlobs ?? {};
    phase3.extraTableBlobs.streams_options = {
      total: phase3.streamOptions.length,
      sample: phase3.streamOptions.slice(0, 100),
    };
  }
  if (phase3.streamArguments.length) {
    phase3.extraTableBlobs = phase3.extraTableBlobs ?? {};
    phase3.extraTableBlobs.streams_arguments = {
      total: phase3.streamArguments.length,
      sample: phase3.streamArguments.slice(0, 100),
    };
  }

  warnings.push(
    `Extended import (${source}): ${phase3.providers.length} providers, ${phase3.providerStreamLinks.length} provider↔stream links, ${phase3.watchFolders.length} watch folders, ${phase3.tickets.length} tickets, ${phase3.epgChannels.length} EPG channels, ${phase3.epgPrograms.length} EPG programmes, ${phase3.blockedAsns.length} ASNs, ${phase3.activityLogs.length} log rows, ${phase3.bandwidthSnapshots.length} stats snapshots${phase3.settingsRaw ? ", settings blob" : ""}, ${phase3.accessCodes.length} access codes, ${phase3.blockedUserAgents.length} blocked UAs, ${phase3.userGroups.length} groups, ${phase3.liveConnections.length} live sessions, ${phase3.onDemandStreamLegacyIds.length} on-demand streams, ${phase3.watchCategories.length} watch categories, ${phase3.watchRefresh.length} watch refresh, ${phase3.epgApiChannels.length} epg_api, ${phase3.epgLanguages.length} epg languages, ${phase3.crontab.length} crontab, ${phase3.profiles.length} profiles, ${phase3.creditLogs.length} credit logs, ${phase3.streamOptions.length} stream options, ${phase3.streamArguments.length} stream args, ${phase3.streamErrors.length} stream errors, ${Object.keys(phase3.extraTableBlobs ?? {}).length} extra blobs.`
  );

  return { phase3, warnings };
}

/**
 * Load phase3 tables from a live Postgres panel (1-stream / Nexlify-style).
 * Fetches by alias match against discovered table names — does not use the
 * log-skipping probe scorer so ActivityLog / ImportJob tables are included.
 */
export async function loadPhase3FromPg(
  tables: { schema: string; name: string }[],
  source: MigrationSource,
  fetchTable: (schema: string, table: string) => Promise<Record<string, unknown>[]>
): Promise<{ phase3: MigrationPhase3Data; warnings: string[] }> {
  const { pgRowsToTableData } = await import("./map-rows");
  const allTables = new Map<string, SqlTableData[]>();
  const wanted = new Set<string>();
  for (const kind of Object.keys(PHASE3_TABLE_ALIASES.shared) as Phase3AliasKind[]) {
    for (const name of aliasesFor(source, kind)) wanted.add(name.toLowerCase());
  }

  for (const t of tables) {
    const key = t.name.toLowerCase();
    if (!wanted.has(key)) continue;
    try {
      const rows = await fetchTable(t.schema, t.name);
      const data = pgRowsToTableData(rows);
      if (!data?.rows.length) continue;
      const list = allTables.get(key) ?? [];
      list.push(data);
      allTables.set(key, list);
    } catch {
      /* table unreadable — skip */
    }
  }

  return loadPhase3FromSql(allTables, source);
}
