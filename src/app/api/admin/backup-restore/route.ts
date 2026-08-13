import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { restoreFullBackup } from "@/lib/backup-restore";
import { computeChecksum, decryptBackup } from "@/lib/backup-run";

/**
 * POST /api/admin/backup-restore
 *
 * Actions:
 * - restore / restore_database: Restore from uploaded JSON snapshot or file content
 * - restore-file: Restore from a file path on the server
 */
export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action } = body;

  if (action === "restore" || action === "restore_database") {
    let snapshot = body.snapshot as Record<string, unknown> | undefined;

    // Handle encrypted backups
    if (body.encrypted && body.data && body.password) {
      try {
        const decrypted = decryptBackup(Buffer.from(body.data, "base64"), body.password);
        snapshot = JSON.parse(decrypted);
      } catch {
        return NextResponse.json({ error: "Decryption failed" }, { status: 400 });
      }
    }

    // Handle checksum verification
    if (body.checksum && snapshot) {
      const actualChecksum = computeChecksum(JSON.stringify(snapshot, null, 2));
      if (actualChecksum !== body.checksum) {
        return NextResponse.json({ error: "Checksum mismatch" }, { status: 400 });
      }
    }

    // Support legacy settings-only restore
    if (!snapshot && Array.isArray(body.panelSettings)) {
      snapshot = { panelSettings: body.panelSettings };
    }

    // Handle uploaded file content (JSON or SQL)
    if (!snapshot && body.fileContent) {
      const content = body.fileContent as string;
      const parsed = parseUploadedBackupContent(content);
      if (parsed) snapshot = parsed;
    }

    if (!snapshot) {
      return NextResponse.json({ error: "snapshot required" }, { status: 400 });
    }

    const result = await restoreFullBackup(snapshot);
    return NextResponse.json({
      ok: result.errors.length === 0,
      restored: result,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/**
 * Parse uploaded backup content — handles both JSON snapshots and SQL dumps.
 * SQL dumps are converted to the snapshot format expected by restoreFullBackup.
 */
function parseUploadedBackupContent(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();

  // Try JSON first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      // If it's an array, wrap in snapshot
      if (Array.isArray(parsed)) {
        return { panelSettings: parsed };
      }
      return parsed;
    } catch {
      // Not valid JSON, try SQL
    }
  }

  // Try SQL dump
  if (/INSERT\s+INTO/i.test(trimmed)) {
    return parseSqlDumpToSnapshot(trimmed);
  }

  return null;
}

/**
 * Parse a SQL dump file and convert INSERT statements to a snapshot format.
 * Maps common table names to snapshot keys.
 * Handles both single-row and multi-row INSERT statements.
 */
function parseSqlDumpToSnapshot(sql: string): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};

  const TABLE_MAP: Record<string, string> = {
    panel_settings: "panelSettings",
    panelsetting: "panelSettings",
    categories: "categories",
    category: "categories",
    bouquets: "bouquets",
    bouquet: "bouquets",
    streams: "streams",
    stream: "streams",
    lines: "lines",
    line: "lines",
    users: "users",
    user: "users",
    packages: "packages",
    package: "packages",
    coupons: "coupons",
    coupon: "coupons",
    epg_sources: "epgSources",
    epgsource: "epgSources",
  };

  // Match INSERT INTO `table` [columns] VALUES (...), (...), ...;
  const insertRegex = /INSERT\s+INTO\s+[`"']?(\w+)[`"']?\s*(?:\([^)]*\)\s*)?VALUES\s*([\s\S]*?);\s*$/gim;

  let match;
  while ((match = insertRegex.exec(sql)) !== null) {
    const tableName = match[1].toLowerCase();
    const valuesBlock = match[2];

    const snapshotKey = TABLE_MAP[tableName];
    if (!snapshotKey) continue;

    if (!Array.isArray(snapshot[snapshotKey])) {
      snapshot[snapshotKey] = [];
    }

    // Split multi-row VALUES: (1,'a'), (2,'b') → ["(1,'a')", "(2,'b')"]
    const rows = splitValueRows(valuesBlock);
    for (const row of rows) {
      const parsed = parseSqlValues(row);
      if (parsed) {
        (snapshot[snapshotKey] as Record<string, unknown>[]).push(parsed);
      }
    }
  }

  return snapshot;
}

/**
 * Split a multi-row VALUES block into individual row strings.
 * Handles nested parentheses, strings with commas, escaped quotes.
 * "(1,'a,b'), (2,'c')" → ["(1,'a,b')", "(2,'c')"]
 */
function splitValueRows(block: string): string[] {
  const rows: string[] = [];
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let current = "";

  for (let i = 0; i < block.length; i++) {
    const ch = block[i];

    if (inString) {
      current += ch;
      if (ch === stringChar && block[i + 1] !== stringChar) {
        inString = false;
      } else if (ch === stringChar && block[i + 1] === stringChar) {
        current += stringChar;
        i++;
      }
    } else {
      if (ch === "'" || ch === '"') {
        inString = true;
        stringChar = ch;
        current += ch;
      } else if (ch === "(") {
        if (depth === 0) current = "";
        depth++;
        current += ch;
      } else if (ch === ")") {
        depth--;
        current += ch;
        if (depth === 0 && current.trim()) {
          rows.push(current.trim());
          current = "";
        }
      } else {
        current += ch;
      }
    }
  }

  return rows;
}

/**
 * Parse the VALUES (...) part of a single INSERT statement into a key-value object.
 * Handles strings, numbers, NULL, and basic types.
 */
function parseSqlValues(valuesStr: string): Record<string, unknown> | null {
  const values: unknown[] = [];
  let current = "";
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < valuesStr.length; i++) {
    const ch = valuesStr[i];

    if (inString) {
      if (ch === stringChar && valuesStr[i + 1] !== stringChar) {
        inString = false;
      } else if (ch === stringChar && valuesStr[i + 1] === stringChar) {
        current += stringChar;
        i++; // skip escaped quote
      } else {
        current += ch;
      }
    } else {
      if (ch === "'" || ch === '"') {
        inString = true;
        stringChar = ch;
      } else if (ch === ",") {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  if (current.trim()) values.push(current.trim());

  if (values.length === 0) return null;

  // Convert to typed values
  return values.map((v) => {
    const s = String(v);
    if (s === "NULL" || s === "null") return null;
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
    const num = Number(s);
    if (!isNaN(num) && s !== "") return num;
    return s;
  }).reduce((obj, val, i) => {
    obj[`col${i}`] = val;
    return obj;
  }, {} as Record<string, unknown>);
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ message: "Use POST with action=restore" });
}
