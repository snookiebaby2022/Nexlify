/** Lightweight MySQL INSERT parser for panel SQL dumps (XUI, 1-stream, Xtream UI). */

export type SqlTableData = {
  columns: string[];
  rows: unknown[][];
};

function unquoteSqlValue(raw: string): unknown {
  const s = raw.trim();
  if (s.toUpperCase() === "NULL") return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    const inner = s.slice(1, -1);
    return inner
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r");
  }
  return s;
}

function splitSqlTuple(inner: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let inQuote: "'" | '"' | null = null;
  let escape = false;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (escape) {
      cur += ch;
      escape = false;
      continue;
    }
    if (ch === "\\" && inQuote) {
      cur += ch;
      escape = true;
      continue;
    }
    if (inQuote) {
      cur += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = ch;
      cur += ch;
      continue;
    }
    if (ch === ",") {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function extractRowTuples(valuesSection: string): string[] {
  const tuples: string[] = [];
  let depth = 0;
  let start = -1;
  let inQuote: "'" | '"' | null = null;
  let escape = false;

  for (let i = 0; i < valuesSection.length; i++) {
    const ch = valuesSection[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inQuote) {
      escape = true;
      continue;
    }
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = ch;
      continue;
    }
    if (ch === "(") {
      if (depth === 0) start = i + 1;
      depth++;
      continue;
    }
    if (ch === ")") {
      depth--;
      if (depth === 0 && start >= 0) {
        tuples.push(valuesSection.slice(start, i));
        start = -1;
      }
    }
  }
  return tuples;
}

/** Parse a single INSERT statement (already extracted, does not scan entire dump). */
function parseSingleInsert(sql: string): { tableName: string; data: SqlTableData } | null {
  const re = /^INSERT\s+INTO\s+[`"']?(\w+)[`"']?(?:\s*\(([^)]*)\))?\s*VALUES\s*/i;
  const match = re.exec(sql);
  if (!match) return null;

  const tableName = match[1].toLowerCase();
  const colPart = match[2] || "";
  const columns = colPart
    ? colPart.split(",").map((c) => c.trim().replace(/^`|`$/g, "")).filter(Boolean)
    : [];

  const valuesStart = match.index + match[0].length;
  let valuesEnd = sql.length;
  const semi = sql.indexOf(";", valuesStart);
  if (semi >= 0) valuesEnd = semi;

  const valuesSection = sql.slice(valuesStart, valuesEnd);
  const tupleStrings = extractRowTuples(valuesSection);
  const rows = tupleStrings.map((t) =>
    splitSqlTuple(t).map((cell) => unquoteSqlValue(cell))
  );

  return { tableName, data: { columns, rows } };
}

/** Parse ALL INSERTs from an in-memory SQL string (small dumps only). */
export function parseAllMysqlInserts(sql: string): Map<string, SqlTableData[]> {
  const results = new Map<string, SqlTableData[]>();
  const insertRe = /INSERT\s+INTO\s+[`"']?\w+[`"']?/gi;
  let match: RegExpExecArray | null;

  while ((match = insertRe.exec(sql)) !== null) {
    const start = match.index;
    // Find the end of this INSERT statement (next INSERT or end of string)
    let end = sql.length;
    const nextInsert = sql.slice(start + 1).search(/INSERT\s+INTO/i);
    if (nextInsert >= 0) end = start + 1 + nextInsert;
    else {
      const semi = sql.lastIndexOf(";");
      if (semi >= start) end = semi + 1;
    }

    const statement = sql.slice(start, end);
    const parsed = parseSingleInsert(statement);
    if (parsed) {
      const existing = results.get(parsed.tableName) ?? [];
      existing.push(parsed.data);
      results.set(parsed.tableName, existing);
    }
  }

  return results;
}

/** Stream-parse a SQL dump file line-by-line (memory-efficient for large dumps). */
export async function parseSqlDumpFile(
  filePath: string,
  onProgress?: (bytesRead: number, totalBytes: number) => void
): Promise<Map<string, SqlTableData[]>> {
  const { createReadStream, statSync } = require("fs");
  const { createInterface } = require("readline");

  const totalBytes = statSync(filePath).size;
  const results = new Map<string, SqlTableData[]>();

  let buffer = "";
  let inInsert = false;
  let bytesRead = 0;
  let lastProgressBytes = 0;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    bytesRead += Buffer.byteLength(line, "utf8") + 1; // +1 for newline

    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      continue;
    }

    if (/^INSERT\s+INTO/i.test(trimmed)) {
      inInsert = true;
      buffer = line + "\n";
    } else if (inInsert) {
      buffer += line + "\n";
      if (trimmed.endsWith(";")) {
        const parsed = parseSingleInsert(buffer);
        if (parsed) {
          const existing = results.get(parsed.tableName) ?? [];
          existing.push(parsed.data);
          results.set(parsed.tableName, existing);
        }
        buffer = "";
        inInsert = false;
      }
    }

    if (onProgress && bytesRead - lastProgressBytes > 10 * 1024 * 1024) {
      lastProgressBytes = bytesRead;
      onProgress(bytesRead, totalBytes);
    }
  }

  // Handle any remaining buffer (incomplete final statement)
  if (buffer && inInsert) {
    const parsed = parseSingleInsert(buffer);
    if (parsed) {
      const existing = results.get(parsed.tableName) ?? [];
      existing.push(parsed.data);
      results.set(parsed.tableName, existing);
    }
  }

  if (onProgress) onProgress(totalBytes, totalBytes);
  return results;
}

/** Legacy single-table parser (kept for compatibility). */
export function parseMysqlInserts(sql: string, tableName: string): SqlTableData[] {
  const all = parseAllMysqlInserts(sql);
  return all.get(tableName.toLowerCase()) ?? [];
}

/** Safe wrapper around parseMysqlInserts. */
export type SqlParseResult = {
  tables: SqlTableData[];
  warnings: string[];
};

export function parseMysqlInsertsSafe(sql: string, tableName: string): SqlParseResult {
  const warnings: string[] = [];
  try {
    const tables = parseMysqlInserts(sql, tableName);
    if (!tables.length) {
      warnings.push(`No INSERT statements found for table "${tableName}"`);
    } else {
      const totalRows = tables.reduce((sum, t) => sum + t.rows.length, 0);
      if (totalRows === 0) {
        warnings.push(`Table "${tableName}" matched but contained no rows`);
      }
    }
    return { tables, warnings };
  } catch (e) {
    warnings.push(`Failed to parse table "${tableName}": ${String(e)}`);
    return { tables: [], warnings };
  }
}

export function mergeSqlTables(chunks: SqlTableData[]): SqlTableData | null {
  if (!chunks.length) return null;
  const columns = chunks[0].columns;
  const rows: unknown[][] = [];
  for (const c of chunks) {
    if (c.columns.join(",") !== columns.join(",")) continue;
    rows.push(...c.rows);
  }
  return { columns, rows };
}

export function rowToRecord(columns: string[], row: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    out[col.toLowerCase()] = row[i];
  });
  return out;
}
