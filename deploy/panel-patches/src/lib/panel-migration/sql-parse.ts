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

export function parseMysqlInserts(sql: string, tableName: string): SqlTableData[] {
  const results: SqlTableData[] = [];
  const re = new RegExp(
    `INSERT\\s+INTO\\s+\`?${tableName}\`?\\s*\\(([^)]+)\\)\\s*VALUES\\s*`,
    "gi"
  );
  let match: RegExpExecArray | null;

  while ((match = re.exec(sql)) !== null) {
    const colPart = match[1];
    const columns = colPart.split(",").map((c) => c.trim().replace(/^`|`$/g, ""));
    const valuesStart = match.index + match[0].length;
    let valuesEnd = sql.length;
    const nextInsert = sql.slice(valuesStart).search(/;\s*INSERT\s+INTO/i);
    if (nextInsert >= 0) valuesEnd = valuesStart + nextInsert;
    else {
      const semi = sql.indexOf(";", valuesStart);
      if (semi >= 0) valuesEnd = semi;
    }
    const valuesSection = sql.slice(valuesStart, valuesEnd);
    const tupleStrings = extractRowTuples(valuesSection);
    const rows = tupleStrings.map((t) =>
      splitSqlTuple(t).map((cell) => unquoteSqlValue(cell))
    );
    results.push({ columns, rows });
  }

  return results;
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
