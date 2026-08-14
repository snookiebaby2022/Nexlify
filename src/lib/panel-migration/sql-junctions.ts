import type { SqlTableData } from "./sql-parse";
import { mergeSqlTables, rowToRecord } from "./sql-parse";

export function looksLikePhpSerialized(s: string): boolean {
  const t = s.trim();
  return /^(a|O|C):\d+:\{/.test(t) || /^s:\d+:"/.test(t);
}

/** String payloads from PHP serialize (`s:N:"value"`), length-accurate. */
export function phpSerializedStringValues(input: string): string[] {
  const out: string[] = [];
  const s = input;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "s" || s[i + 1] !== ":") continue;
    let j = i + 2;
    let num = "";
    while (j < s.length && s[j] >= "0" && s[j] <= "9") num += s[j++];
    if (!num || s[j] !== ":" || s[j + 1] !== '"') continue;
    const len = Number(num);
    const start = j + 2;
    if (!Number.isFinite(len) || len < 0 || start + len > s.length) continue;
    out.push(s.slice(start, start + len));
    i = start + len;
  }
  return out;
}

/**
 * Array *values* (not keys) from PHP-serialized id lists.
 * `a:2:{i:0;i:12;i:1;i:34;}` → `["12","34"]` (skips the 0/1 indexes).
 */
export function phpSerializedIdValues(input: string): string[] {
  const ids: string[] = [];
  const re = /(?:i:\d+;|s:\d+:"(?:\\.|[^"\\])*";)(?:i:(\d+);|s:\d+:"(\d+)")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    const id = m[1] || m[2];
    if (id && id !== "0") ids.push(id);
  }
  return [...new Set(ids)];
}

const STREAM_URL_RE =
  /^(https?|rtmp|rtmps|rtsp|rtsps|udp|rtp|srt|mms|mmsh|file):\/\//i;

/** True for a playable IPTV URL (scheme, absolute path, or host:port/path). */
export function looksLikePlayableUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (STREAM_URL_RE.test(t) || t.startsWith("/") || t.startsWith("//")) return true;
  if (/^[a-z0-9.-]+:\d+\//i.test(t)) return true;
  return t.includes("://");
}

/** Pull playable URLs out of a PHP-serialized stream_source blob. */
export function urlsFromPhpSerialized(val: unknown): string[] {
  if (typeof val !== "string") return [];
  const s = val.trim();
  if (!looksLikePhpSerialized(s)) return [];
  return phpSerializedStringValues(s)
    .map((u) => u.trim())
    .filter((u) => looksLikePlayableUrl(u));
}

/** Flatten XUI-style bouquet channel payloads:
 *  - `[1,2,3]`
 *  - `{"live":[1,2],"vod":[3],"series":[4]}`
 *  - `"1,2,3"`
 *  - PHP serialized arrays (`a:2:{s:4:"live";a:2:{i:0;i:12;…}}`)
 */
export function flattenIdList(val: unknown): string[] {
  if (val == null || val === "") return [];
  if (Array.isArray(val)) {
    const out: string[] = [];
    for (const x of val) {
      if (x == null || x === "") continue;
      if (typeof x === "object") out.push(...flattenIdList(x));
      else out.push(String(x));
    }
    return [...new Set(out.filter(Boolean))];
  }
  if (typeof val === "object") {
    const out: string[] = [];
    for (const v of Object.values(val as Record<string, unknown>)) {
      out.push(...flattenIdList(v));
    }
    return [...new Set(out.filter(Boolean))];
  }
  const s = String(val).trim();
  if (!s) return [];
  if (looksLikePhpSerialized(s)) {
    const ids = phpSerializedIdValues(s);
    if (ids.length) return ids;
  }
  try {
    return flattenIdList(JSON.parse(s));
  } catch {
    if (s.includes(",")) {
      return [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))];
    }
    return [s];
  }
}

const BOUQUET_STREAM_JUNCTIONS = [
  "bouquet_streams",
  "bouquet_stream",
  "package_streams",
  "package_stream",
  "streams_bouquets",
  "bouquets_streams",
  "bouquet_channels",
];

const LINE_BOUQUET_JUNCTIONS = [
  "subscription_packages",
  "subscription_package",
  "line_bouquets",
  "line_bouquet",
  "user_bouquets",
  "user_bouquet",
  "users_bouquets",
  "users_packages",
  "user_packages",
  "member_packages",
  "lines_bouquets",
];

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

function detectBouquetStreamCols(columns: string[]) {
  const bouquetCol =
    columns.find((c) => /bouquet|package|bundle/i.test(c) && /id/i.test(c)) ??
    columns.find((c) => c === "bouquet_id" || c === "package_id") ??
    "bouquet_id";
  const streamCol =
    columns.find((c) => /stream|channel/i.test(c) && /id/i.test(c)) ??
    columns.find((c) => c === "stream_id" || c === "channel_id") ??
    "stream_id";
  return { bouquetCol, streamCol };
}

function detectLineBouquetCols(columns: string[]) {
  const lineCol =
    columns.find((c) => /line|subscription|client|user/i.test(c) && /id/i.test(c)) ??
    columns.find((c) => c === "line_id" || c === "subscription_id" || c === "user_id") ??
    "line_id";
  const bouquetCol =
    columns.find((c) => /bouquet|package|bundle/i.test(c) && /id/i.test(c)) ??
    columns.find((c) => c === "bouquet_id" || c === "package_id") ??
    "bouquet_id";
  return { lineCol, bouquetCol };
}

/** Merge SQL junction tables into bouquets/lines column payloads (same as live PG path). */
export function enrichSqlTablesFromJunctions(
  allTables: Map<string, SqlTableData[]>,
  bouquets: SqlTableData | null,
  lines: SqlTableData | null
): { bouquets: SqlTableData | null; lines: SqlTableData | null; warnings: string[] } {
  const warnings: string[] = [];
  let nextBouquets = bouquets;
  let nextLines = lines;

  const bs = findMerged(allTables, BOUQUET_STREAM_JUNCTIONS);
  if (bs && nextBouquets) {
    const { bouquetCol, streamCol } = detectBouquetStreamCols(bs.columns);
    const byBouquet = new Map<string, string[]>();
    for (const row of bs.rows) {
      const r = rowToRecord(bs.columns, row);
      const bid = String(r[bouquetCol] ?? r.package_id ?? r.bouquet_id ?? "");
      const sid = String(r[streamCol] ?? r.stream_id ?? r.channel_id ?? "");
      if (!bid || !sid) continue;
      const list = byBouquet.get(bid) ?? [];
      list.push(sid);
      byBouquet.set(bid, list);
    }
    if (byBouquet.size) {
      const idIdx = nextBouquets.columns.findIndex((c) => c === "id");
      let channelsIdx = nextBouquets.columns.findIndex((c) =>
        ["bouquet_channels", "bouquet_streams", "channels", "stream_ids", "streams"].includes(c)
      );
      if (channelsIdx < 0) {
        nextBouquets.columns.push("bouquet_channels");
        channelsIdx = nextBouquets.columns.length - 1;
        for (const row of nextBouquets.rows) row.push(null);
      }
      for (const row of nextBouquets.rows) {
        const id = idIdx >= 0 ? String(row[idIdx]) : "";
        const extra = byBouquet.get(id);
        if (!extra?.length) continue;
        row[channelsIdx] = JSON.stringify([
          ...flattenIdList(row[channelsIdx]),
          ...extra,
        ]);
      }
      warnings.push(`Merged ${byBouquet.size} bouquet↔stream link groups from SQL junction tables`);
    }
  }

  const lb = findMerged(allTables, LINE_BOUQUET_JUNCTIONS);
  if (lb && nextLines) {
    const { lineCol, bouquetCol } = detectLineBouquetCols(lb.columns);
    const byLine = new Map<string, string[]>();
    for (const row of lb.rows) {
      const r = rowToRecord(lb.columns, row);
      const lid = String(r[lineCol] ?? r.line_id ?? r.subscription_id ?? r.user_id ?? "");
      const bid = String(r[bouquetCol] ?? r.bouquet_id ?? r.package_id ?? "");
      if (!lid || !bid) continue;
      const list = byLine.get(lid) ?? [];
      list.push(bid);
      byLine.set(lid, list);
    }
    if (byLine.size) {
      const idIdx = nextLines.columns.findIndex((c) => c === "id");
      let bouquetIdx = nextLines.columns.findIndex((c) =>
        ["bouquet", "bouquets", "bouquet_ids", "package_id", "packages"].includes(c)
      );
      if (bouquetIdx < 0) {
        nextLines.columns.push("bouquet");
        bouquetIdx = nextLines.columns.length - 1;
        for (const row of nextLines.rows) row.push(null);
      }
      for (const row of nextLines.rows) {
        const id = idIdx >= 0 ? String(row[idIdx]) : "";
        const extra = byLine.get(id);
        if (!extra?.length) continue;
        row[bouquetIdx] = JSON.stringify([...flattenIdList(row[bouquetIdx]), ...extra]);
      }
      warnings.push(`Merged ${byLine.size} line↔bouquet link groups from SQL junction tables`);
    }
  }

  return { bouquets: nextBouquets, lines: nextLines, warnings };
}
