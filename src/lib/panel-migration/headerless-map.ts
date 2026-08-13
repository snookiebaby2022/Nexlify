/**
 * Content-based column inference for "headerless" SQL dumps.
 *
 * Some panel exports (notably XUI.one backups) emit INSERT statements without a
 * column list, e.g. `INSERT INTO streams VALUES (1, 'CNN', 'http://...', 1);`.
 * The generic parser leaves `columns` empty for these, so `rowToRecord` yields
 * `{}` and every row is silently dropped (the "0 rows mapped" warning).
 *
 * Instead of requiring the user to re-export, we infer each column's semantic
 * field by analysing the *values* it contains (ids are integers, urls start with
 * a scheme, macs match a MAC pattern, expiries are unix timestamps, etc.) and
 * assign the canonical field name the mappers expect. This works regardless of
 * the source panel's column order or naming.
 */

import type { MigrationSource } from "./types";
import type { SqlTableData } from "./sql-parse";
import { PANEL_PROFILES } from "./profiles";

export type HeaderlessTableType =
  | "streams"
  | "bouquets"
  | "lines"
  | "resellers"
  | "mag"
  | "enigma"
  | "categories"
  | "servers"
  | "epg";

type FieldSpec = {
  /** Canonical field name the mappers read (their first alias). */
  name: string;
  /** Higher priority claims a column first to avoid conflicts. */
  priority: number;
  /** Minimum confidence (0..1) required to claim a column. */
  threshold?: number;
  score: (col: unknown[], rows: unknown[][], colIndex: number) => number;
};

// ---------------------------------------------------------------------------
// value classifiers
// ---------------------------------------------------------------------------

function isNullish(v: unknown): boolean {
  return v == null || v === "" || (typeof v === "string" && v.trim().toUpperCase() === "NULL");
}

function asStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function asNum(v: unknown): number {
  if (typeof v === "number") return v;
  const s = asStr(v).trim();
  if (s === "") return NaN;
  return Number(s);
}

function isInt(v: unknown): boolean {
  if (typeof v === "number") return Number.isInteger(v);
  return /^-?\d+$/.test(asStr(v).trim());
}

function isSmallInt(v: unknown, max = 100): boolean {
  const n = asNum(v);
  return Number.isInteger(n) && n >= 0 && n <= max;
}

function isUnixTimestamp(v: unknown): boolean {
  const n = asNum(v);
  if (Number.isFinite(n) && n > 1e9 && n < 4e10) return true;
  return /^\d{10,13}$/.test(asStr(v).trim());
}

function isDateString(v: unknown): boolean {
  const s = asStr(v).trim().toLowerCase();
  return /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s);
}

function isZeroOne(v: unknown): boolean {
  const n = asNum(v);
  return n === 0 || n === 1;
}

function isUrl(v: unknown): boolean {
  const s = asStr(v).trim().toLowerCase();
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("rtmp") ||
    s.startsWith("rtsp") ||
    s.includes("://")
  );
}

function isMac(v: unknown): boolean {
  const s = asStr(v).trim();
  if (/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(s)) return true;
  const hex = s.replace(/[^a-f0-9]/gi, "");
  return hex.length >= 12 && hex.length <= 17 && /^[a-f0-9]+$/i.test(hex);
}

function looksLikeUsername(v: unknown): boolean {
  const s = asStr(v).trim();
  if (s.length < 2 || s.length > 64) return false;
  if (/\s/.test(s)) return false;
  // Require at least one letter so purely-numeric ids (e.g. line_id=101) are
  // not mistaken for usernames.
  if (!/[a-z]/i.test(s)) return false;
  return /^[a-z0-9_.@\-]+$/i.test(s);
}

function looksLikePassword(v: unknown): boolean {
  const s = asStr(v).trim();
  if (s.length < 2 || s.length > 200) return false;
  if (isUrl(v) || isMac(v)) return false;
  return true;
}

function isJsonArrayLike(v: unknown): boolean {
  const s = asStr(v).trim();
  if (s.startsWith("[") || s.startsWith("{")) return true;
  const compact = s.replace(/\s/g, "");
  return compact.includes(",") && /^[\d,"\[\]{}:]+$/.test(compact);
}

function isIp(v: unknown): boolean {
  const s = asStr(v).trim();
  return /\d{1,3}(\.\d{1,3}){3}/.test(s) || /^([0-9a-f]{1,4}:)/i.test(s);
}

function frac(col: unknown[], pred: (v: unknown) => boolean): number {
  let n = 0;
  let ok = 0;
  for (const v of col) {
    if (isNullish(v)) continue;
    n++;
    if (pred(v)) ok++;
  }
  return n === 0 ? 0 : ok / n;
}

function isPlainString(v: unknown): boolean {
  const s = asStr(v).trim();
  return s.length >= 1 && s.length <= 200 && !isInt(v) && !isUrl(v) && !isMac(v);
}

// ---------------------------------------------------------------------------
// field specs per table type (critical fields first)
// ---------------------------------------------------------------------------

const SPECS: Record<HeaderlessTableType, FieldSpec[]> = {
  streams: [
    { name: "id", priority: 100, threshold: 0.8, score: (col, _r, i) => frac(col, isInt) + (i === 0 ? 0.1 : 0) },
    { name: "stream_display_name", priority: 95, threshold: 0.6, score: (col) => frac(col, isPlainString) },
    { name: "stream_source", priority: 92, threshold: 0.5, score: (col) => frac(col, isUrl) },
    {
      name: "type",
      priority: 88,
      threshold: 0.55,
      score: (col) =>
        frac(col, (v) => {
          const n = asNum(v);
          return (n >= 1 && n <= 5) || /^(live|movie|series|vod|radio)$/i.test(asStr(v).trim());
        }),
    },
    { name: "category_id", priority: 82, threshold: 0.6, score: (col) => frac(col, isInt) },
    { name: "channel_id", priority: 80, threshold: 0.6, score: (col) => frac(col, isInt) },
    { name: "epg_channel_id", priority: 78, threshold: 0.6, score: (col) => frac(col, isInt) },
    {
      name: "stream_icon",
      priority: 70,
      threshold: 0.4,
      score: (col) => frac(col, (v) => isUrl(v) || /\.(png|jpe?g|gif|webp|svg)$/i.test(asStr(v).trim())),
    },
    {
      name: "container_extension",
      priority: 62,
      threshold: 0.5,
      score: (col) => frac(col, (v) => /^(mp4|mkv|ts|m3u8|flv|avi|webm|mp3)$/i.test(asStr(v).trim())),
    },
    { name: "is_deleted", priority: 66, threshold: 0.8, score: (col) => frac(col, isZeroOne) },
    { name: "enabled", priority: 64, threshold: 0.8, score: (col) => frac(col, isZeroOne) },
    { name: "order_num", priority: 60, threshold: 0.6, score: (col) => frac(col, (v) => isSmallInt(v, 1_000_000)) },
    { name: "category_name", priority: 55, threshold: 0.5, score: (col) => frac(col, isPlainString) },
  ],
  bouquets: [
    { name: "id", priority: 100, threshold: 0.8, score: (col, _r, i) => frac(col, isInt) + (i === 0 ? 0.1 : 0) },
    { name: "bouquet_name", priority: 95, threshold: 0.6, score: (col) => frac(col, isPlainString) },
    { name: "bouquet_channels", priority: 85, threshold: 0.5, score: (col) => frac(col, (v) => isInt(v) || isJsonArrayLike(v)) },
    { name: "sort_order", priority: 60, threshold: 0.7, score: (col) => frac(col, isInt) },
  ],
  lines: [
    { name: "id", priority: 100, threshold: 0.8, score: (col, _r, i) => frac(col, isInt) + (i === 0 ? 0.1 : 0) },
    { name: "username", priority: 95, threshold: 0.65, score: (col) => frac(col, looksLikeUsername) },
    { name: "password", priority: 90, threshold: 0.5, score: (col) => frac(col, looksLikePassword) },
    { name: "exp_date", priority: 85, threshold: 0.55, score: (col) => frac(col, (v) => isUnixTimestamp(v) || isDateString(v)) },
    { name: "max_connections", priority: 80, threshold: 0.7, score: (col) => frac(col, (v) => isSmallInt(v, 100)) },
    { name: "bouquet", priority: 78, threshold: 0.5, score: (col) => frac(col, (v) => isInt(v) || isJsonArrayLike(v)) },
    { name: "member_id", priority: 72, threshold: 0.6, score: (col) => frac(col, (v) => isInt(v) && !isZeroOne(v)) },
    { name: "is_banned", priority: 70, threshold: 0.8, score: (col) => frac(col, isZeroOne) },
    { name: "is_disabled", priority: 68, threshold: 0.8, score: (col) => frac(col, isZeroOne) },
    { name: "is_adult", priority: 60, threshold: 0.8, score: (col) => frac(col, isZeroOne) },
    { name: "lock_device", priority: 58, threshold: 0.8, score: (col) => frac(col, isZeroOne) },
    { name: "admin_notes", priority: 50, threshold: 0.4, score: (col) => frac(col, isPlainString) },
    { name: "allowed_ips", priority: 48, threshold: 0.4, score: (col) => frac(col, isIp) },
    { name: "allowed_countries", priority: 46, threshold: 0.4, score: (col) => frac(col, isPlainString) },
    { name: "blocked_countries", priority: 44, threshold: 0.4, score: (col) => frac(col, isPlainString) },
    { name: "allowed_outputs", priority: 42, threshold: 0.4, score: (col) => frac(col, isPlainString) },
  ],
  resellers: [
    { name: "id", priority: 100, threshold: 0.8, score: (col, _r, i) => frac(col, isInt) + (i === 0 ? 0.1 : 0) },
    { name: "username", priority: 95, threshold: 0.65, score: (col) => frac(col, looksLikeUsername) },
    {
      name: "password",
      priority: 90,
      threshold: 0.5,
      score: (col) => frac(col, (v) => looksLikePassword(v) && !looksLikeUsername(v)),
    },
    { name: "is_admin", priority: 82, threshold: 0.8, score: (col) => frac(col, isZeroOne) },
    { name: "member_group_id", priority: 80, threshold: 0.6, score: (col) => frac(col, (v) => isInt(v) && !isZeroOne(v)) },
    { name: "is_reseller", priority: 78, threshold: 0.8, score: (col) => frac(col, isZeroOne) },
    {
      name: "credits",
      priority: 70,
      threshold: 0.6,
      score: (col) => frac(col, (v) => {
        const n = asNum(v);
        return Number.isFinite(n) && n >= 0 && n <= 1e12;
      }),
    },
    { name: "status", priority: 64, threshold: 0.8, score: (col) => frac(col, isZeroOne) },
  ],
  mag: headerlessStbSpecs(),
  enigma: headerlessStbSpecs(),
  categories: [
    { name: "id", priority: 100, threshold: 0.8, score: (col, _r, i) => frac(col, isInt) + (i === 0 ? 0.1 : 0) },
    { name: "category_name", priority: 95, threshold: 0.6, score: (col) => frac(col, (v) => { const s = asStr(v).trim(); return s.length >= 1 && s.length <= 200 && !isInt(v); }) },
    { name: "parent_id", priority: 80, threshold: 0.6, score: (col) => frac(col, isInt) },
  ],
  servers: [
    { name: "id", priority: 100, threshold: 0.8, score: (col, _r, i) => frac(col, isInt) + (i === 0 ? 0.1 : 0) },
    { name: "server_ip", priority: 95, threshold: 0.6, score: (col) => frac(col, isIp) },
    { name: "server_name", priority: 90, threshold: 0.5, score: (col) => frac(col, isPlainString) },
    {
      name: "port",
      priority: 80,
      threshold: 0.7,
      score: (col) => frac(col, (v) => { const n = asNum(v); return Number.isInteger(n) && n >= 1 && n <= 65535; }),
    },
    { name: "protocol", priority: 60, threshold: 0.5, score: (col) => frac(col, (v) => /^(http|https|rtmp|rtsp)$/i.test(asStr(v).trim())) },
  ],
  epg: [
    {
      name: "url",
      priority: 100,
      threshold: 0.55,
      score: (col) => frac(col, (v) => isUrl(v) || /\.xml$|\.gz$|xmltv|epg/i.test(asStr(v))),
    },
    { name: "name", priority: 90, threshold: 0.5, score: (col) => frac(col, isPlainString) },
    {
      name: "country",
      priority: 70,
      threshold: 0.4,
      score: (col) => frac(col, (v) => { const s = asStr(v).trim(); return s.length >= 1 && s.length <= 10 && !/^\d/.test(s) && !isUrl(v); }),
    },
  ],
};

function headerlessStbSpecs(): FieldSpec[] {
  return [
    { name: "mac", priority: 100, threshold: 0.8, score: (col) => frac(col, isMac) },
    { name: "username", priority: 90, threshold: 0.6, score: (col) => frac(col, looksLikeUsername) },
    { name: "user_id", priority: 80, threshold: 0.6, score: (col) => frac(col, isInt) },
    { name: "line_id", priority: 78, threshold: 0.6, score: (col) => frac(col, isInt) },
    { name: "model", priority: 60, threshold: 0.4, score: (col) => frac(col, (v) => { const s = asStr(v).trim(); return s.length > 0 && !isInt(v) && !isMac(v); }) },
  ];
}

// ---------------------------------------------------------------------------
// Schema-order fallback for ambiguous integer columns
// ---------------------------------------------------------------------------
//
// Content-based detection reliably identifies *distinctive* columns (usernames,
// passwords, URLs, MACs, dates, flags, names). It cannot separate the many
// integer columns that 1-stream/XUI dumps contain (user_id, package_id,
// bouquet, line_id, max_connections, category_id, type, …) because their values
// are indistinguishable by content. For those we fall back to the documented
// column ORDER of the known source schema. These templates are only consulted
// after content-based detection, and only fill columns content-based left
// unclaimed (or correct a mis-claimed integer column), so they never override a
// confidently detected distinctive field.

const XUI_COMMON: Record<HeaderlessTableType, string[]> = {
  lines: [
    "id", "user_id", "package_id", "bouquet", "line_id", "username", "password",
    "exp_date", "max_connections", "is_enabled", "is_banned", "notes", "reseller_id",
  ],
  streams: [
    "id", "user_id", "category_id", "stream_display_name", "stream_icon", "notes",
    "stream_type", "stream_source", "stream_url", "container_extension",
    "is_deleted", "enabled", "order_num",
  ],
  bouquets: ["id", "bouquet_name", "bouquet_channels", "sort_order"],
  resellers: [
    "id", "username", "password", "email", "is_admin", "is_reseller",
    "member_group_id", "credits", "status",
  ],
  mag: ["id", "mac", "username", "line_id", "model"],
  enigma: ["id", "mac", "username", "line_id", "model"],
  categories: ["id", "category_name", "parent_id"],
  servers: ["id", "server_ip", "server_name", "port", "protocol"],
  epg: ["id", "name", "url", "country"],
};

const KNOWN_COLUMN_ORDER: Partial<
  Record<MigrationSource, Partial<Record<HeaderlessTableType, string[]>>>
> = {
  onestream: XUI_COMMON,
  xui: XUI_COMMON,
  xtream_ui: XUI_COMMON,
};

// ---------------------------------------------------------------------------
// inference
// ---------------------------------------------------------------------------

export function inferHeaderlessColumns(
  type: HeaderlessTableType,
  rows: unknown[][],
  knownOrder?: string[]
): string[] {
  const specs = SPECS[type];
  const nCols = rows[0]?.length ?? 0;
  const columns: string[] = new Array(nCols).fill("");
  const used = new Set<number>();
  const sorted = [...specs].sort((a, b) => b.priority - a.priority);

  for (const spec of sorted) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < nCols; i++) {
      if (used.has(i)) continue;
      const col = rows.map((r) => r[i]);
      const s = spec.score(col, rows, i);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    const threshold = spec.threshold ?? 0.7;
    if (best >= 0 && bestScore >= threshold) {
      columns[best] = spec.name;
      used.add(best);
    }
  }

  // Schema-order fallback: for sources with a known column order (1-stream/XUI),
  // the documented schema order is authoritative for resolving the many
  // integer columns that content-based cannot separate. Override every position
  // the template defines; positions beyond the template keep content-based (or
  // placeholder). Tables without a known order rely on content-based alone.
  if (knownOrder) {
    for (let i = 0; i < nCols; i++) {
      const name = knownOrder[i];
      if (name) columns[i] = name;
    }
  }

  for (let i = 0; i < nCols; i++) if (!columns[i]) columns[i] = `__c${i}`;
  return columns;
}

const TYPE_PRIORITY: HeaderlessTableType[] = [
  "streams",
  "bouquets",
  "lines",
  "resellers",
  "mag",
  "enigma",
  "categories",
  "servers",
  "epg",
];

/**
 * Inspect every parsed table; for headerless tables (empty column list but rows
 * present) infer and attach canonical column names by content. Returns human
 * readable notes describing what was auto-mapped (for the migration report).
 */
export function applyHeaderlessInference(
  allTables: Map<string, SqlTableData[]>,
  source: MigrationSource
): string[] {
  const profile = PANEL_PROFILES[source];
  const nameToType = new Map<string, HeaderlessTableType>();
  for (const t of TYPE_PRIORITY) {
    for (const n of profile[t]) {
      const key = n.toLowerCase();
      if (!nameToType.has(key)) nameToType.set(key, t);
    }
  }

  const notes: string[] = [];

  for (const [name, chunks] of allTables) {
    const type = nameToType.get(name.toLowerCase());
    if (!type) continue;
    const headerless = chunks.filter((c) => c.columns.length === 0 && c.rows.length > 0);
    if (!headerless.length) continue;

    // If the dump has some headerful chunks for this table, reuse their column
    // order (best effort) so mergeSqlTables keeps all chunks.
    const headerful = chunks.find((c) => c.columns.length > 0);
    if (headerful) {
      for (const c of headerless) c.columns = headerful.columns.slice();
      continue;
    }

    const sample: unknown[][] = [];
    for (const c of headerless) {
      for (const r of c.rows) {
        sample.push(r);
        if (sample.length >= 200) break;
      }
      if (sample.length >= 200) break;
    }
    if (!sample.length) continue;

    const columns = inferHeaderlessColumns(type, sample, KNOWN_COLUMN_ORDER[source]?.[type]);
    const mapped = columns.filter((c) => !c.startsWith("__c")).length;
    for (const c of headerless) c.columns = columns;
    notes.push(
      `Auto-mapped ${mapped}/${columns.length} columns for headerless table "${name}" by value content (no column names in source dump).`
    );
  }

  return notes;
}
