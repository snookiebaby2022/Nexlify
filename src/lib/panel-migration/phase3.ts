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

  warnings.push(
    `Extended import (${source}): ${phase3.providers.length} providers, ${phase3.providerStreamLinks.length} provider↔stream links, ${phase3.watchFolders.length} watch folders, ${phase3.tickets.length} tickets, ${phase3.epgChannels.length} EPG channels, ${phase3.epgPrograms.length} EPG programmes, ${phase3.blockedAsns.length} ASNs, ${phase3.activityLogs.length} log rows, ${phase3.bandwidthSnapshots.length} stats snapshots${phase3.settingsRaw ? ", settings blob" : ""}.`
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
