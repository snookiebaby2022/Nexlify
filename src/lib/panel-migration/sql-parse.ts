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

/** Parse a single INSERT/REPLACE statement (already extracted). */
function parseSingleInsert(sql: string): { tableName: string; data: SqlTableData } | null {
  // Handles: INSERT INTO t, INSERT IGNORE INTO `db`.`t`, REPLACE INTO t (`a`,`b`) VALUES ...
  const re =
    /^\s*(?:INSERT(?:\s+(?:IGNORE|DELAYED|LOW_PRIORITY|HIGH_PRIORITY))*\s+INTO|REPLACE\s+(?:INTO\s+)?)\s+(?:[`"']?\w+[`"']?\.)?[`"']?(\w+)[`"']?(?:\s*\(([^)]*)\))?\s*VALUES\s*/i;
  const match = re.exec(sql);
  if (!match) return null;

  const tableName = match[1].toLowerCase();
  const colPart = match[2] || "";
  const columns = colPart
    ? colPart
        .split(",")
        .map((c) => c.trim().replace(/^[`"']|[`"']$/g, ""))
        .filter(Boolean)
        .map((c) => c.toLowerCase())
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

/**
 * Extract column names from CREATE TABLE statements in a mysqldump.
 * Used to label headerless INSERT … VALUES dumps accurately.
 */
export function parseCreateTableColumns(sql: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"']?\w+[`"']?\.)?[`"']?(\w+)[`"']?\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    const tableName = match[1].toLowerCase();
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    let inQuote: "'" | '"' | "`" | null = null;
    let escape = false;
    for (; i < sql.length && depth > 0; i++) {
      const ch = sql[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\" && inQuote && inQuote !== "`") {
        escape = true;
        continue;
      }
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") {
        inQuote = ch;
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    const body = sql.slice(start, i - 1);
    const cols: string[] = [];
    // Split on commas at depth 0 within the CREATE body
    let part = "";
    depth = 0;
    inQuote = null;
    escape = false;
    const parts: string[] = [];
    for (let j = 0; j < body.length; j++) {
      const ch = body[j];
      if (escape) {
        part += ch;
        escape = false;
        continue;
      }
      if (ch === "\\" && inQuote && inQuote !== "`") {
        part += ch;
        escape = true;
        continue;
      }
      if (inQuote) {
        part += ch;
        if (ch === inQuote) inQuote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") {
        inQuote = ch;
        part += ch;
        continue;
      }
      if (ch === "(") {
        depth++;
        part += ch;
        continue;
      }
      if (ch === ")") {
        depth--;
        part += ch;
        continue;
      }
      if (ch === "," && depth === 0) {
        parts.push(part);
        part = "";
        continue;
      }
      part += ch;
    }
    if (part.trim()) parts.push(part);

    for (const p of parts) {
      const trimmed = p.trim();
      if (
        /^(PRIMARY\s+KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FULLTEXT|SPATIAL|FOREIGN|CHECK)/i.test(
          trimmed
        )
      ) {
        continue;
      }
      const cm = /^[`"']?(\w+)[`"']?\s+/.exec(trimmed);
      if (cm) cols.push(cm[1].toLowerCase());
    }
    if (cols.length) out.set(tableName, cols);
  }
  return out;
}

/** Parse ALL INSERTs from an in-memory SQL string (small dumps only). */
export function parseAllMysqlInserts(sql: string): Map<string, SqlTableData[]> {
  const results = new Map<string, SqlTableData[]>();
  const insertRe = /(?:INSERT(?:\s+(?:IGNORE|DELAYED|LOW_PRIORITY|HIGH_PRIORITY))*\s+INTO|REPLACE\s+(?:INTO\s+)?)\s+(?:[`"']?\w+[`"']?\.)?[`"']?\w+[`"']?/gi;
  let match: RegExpExecArray | null;

  while ((match = insertRe.exec(sql)) !== null) {
    const start = match.index;
    let end = sql.length;
    const nextInsert = sql.slice(start + 1).search(/(?:INSERT(?:\s+\w+)*\s+INTO|REPLACE\s+(?:INTO\s+)?)/i);
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
): Promise<{ tables: Map<string, SqlTableData[]>; createColumns: Map<string, string[]> }> {
  const { createReadStream, statSync } = require("fs");
  const { createInterface } = require("readline");

  const totalBytes = statSync(filePath).size;
  const results = new Map<string, SqlTableData[]>();
  const createColumns = new Map<string, string[]>();

  let buffer = "";
  let inInsert = false;
  let inCreate = false;
  let bytesRead = 0;
  let lastProgressBytes = 0;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    bytesRead += Buffer.byteLength(line, "utf8") + 1; // +1 for newline

    const trimmed = line.trim();

    // Skip comments and empty lines (but keep buffering create/insert bodies)
    if (!inInsert && !inCreate) {
      if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        continue;
      }
    }

    if (!inInsert && /^(?:CREATE\s+TABLE)\b/i.test(trimmed)) {
      inCreate = true;
      buffer = line + "\n";
      if (trimmed.endsWith(";")) {
        for (const [k, v] of parseCreateTableColumns(buffer)) createColumns.set(k, v);
        buffer = "";
        inCreate = false;
      }
      continue;
    }

    if (inCreate) {
      buffer += line + "\n";
      if (trimmed.endsWith(";")) {
        for (const [k, v] of parseCreateTableColumns(buffer)) createColumns.set(k, v);
        buffer = "";
        inCreate = false;
      }
      continue;
    }

    if (/^(?:INSERT(?:\s+\w+)*\s+INTO|REPLACE\s+(?:INTO\s+)?)/i.test(trimmed)) {
      inInsert = true;
      buffer = line + "\n";
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
  if (buffer && inCreate) {
    for (const [k, v] of parseCreateTableColumns(buffer)) createColumns.set(k, v);
  }

  if (onProgress) onProgress(totalBytes, totalBytes);
  return { tables: results, createColumns };
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
  const colSet: string[] = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    for (const col of c.columns) {
      const k = col.toLowerCase();
      if (k && !seen.has(k)) {
        seen.add(k);
        colSet.push(k);
      }
    }
  }
  if (!colSet.length) {
    const rows: unknown[][] = [];
    for (const c of chunks) rows.push(...c.rows);
    return { columns: [], rows };
  }
  const rows: unknown[][] = [];
  for (const c of chunks) {
    const idx = new Map(c.columns.map((col, i) => [col.toLowerCase(), i]));
    for (const row of c.rows) {
      if (!c.columns.length && row.length) {
        rows.push(row);
        continue;
      }
      rows.push(
        colSet.map((col) => {
          const i = idx.get(col);
          return i == null ? null : row[i];
        })
      );
    }
  }
  return { columns: colSet, rows };
}

export function rowToRecord(columns: string[], row: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    out[col.toLowerCase()] = row[i];
  });
  return out;
}
