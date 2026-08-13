import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { restoreFullBackup } from "@/lib/backup-restore";
import { computeChecksum, decryptBackup } from "@/lib/backup-run";
import { bundleFromSql } from "@/lib/panel-migration/map-rows";
import type { MigrationBundle, MigrationSource } from "@/lib/panel-migration/types";

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
 * SQL dumps use the proper migration engine (bundleFromSql) for correct column mapping.
 */
function parseUploadedBackupContent(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();

  // Try JSON first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return { panelSettings: parsed };
      }
      return parsed;
    } catch {
      // Not valid JSON, try SQL
    }
  }

  // Try SQL dump — use the migration engine for proper column mapping
  if (/INSERT\s+INTO/i.test(trimmed)) {
    return migrationBundleToSnapshot(trimmed);
  }

  return null;
}

/**
 * Quick-detect the most likely migration source by scanning table names in the SQL.
 * Much faster than running bundleFromSql multiple times.
 */
function detectSource(sql: string): MigrationSource {
  const lower = sql.toLowerCase();

  // xtream_ui uses "users" as the lines table
  if (/INSERT\s+INTO\s+[`"']?users[`"']?\s*\(/i.test(sql) && /INSERT\s+INTO\s+[`"']?lines[`"']?\s*\(/i.test(sql)) {
    return "xtream_ui";
  }

  // onestream uses "subscriptions" or "subscription"
  if (/INSERT\s+INTO\s+[`"']?subscriptions?[`"']?\s*\(/i.test(sql)) {
    return "onestream";
  }

  // midnight uses "subscribers"
  if (/INSERT\s+INTO\s+[`"']?subscribers[`"']?\s*\(/i.test(sql)) {
    return "midnight";
  }

  // Default to xui (most common — has lines, streams, bouquets)
  return "xui";
}

/**
 * Convert a SQL dump to the snapshot format expected by restoreFullBackup,
 * using the proper migration engine for column mapping.
 */
function migrationBundleToSnapshot(sql: string): Record<string, unknown> {
  const source = detectSource(sql);
  const bundle = bundleFromSql(sql, source);
  return bundleToSnapshot(bundle);
}

/**
 * Convert a MigrationBundle to the flat snapshot format used by restoreFullBackup.
 */
function bundleToSnapshot(bundle: MigrationBundle): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};

  // Lines → snapshot.lines (with proper field names)
  if (bundle.lines?.length) {
    snapshot.lines = bundle.lines.map((l) => ({
      id: l.legacyId ?? l.username,
      username: l.username,
      password: l.password,
      expiresAt: l.expiresAt?.toISOString?.() ?? l.expiresAt,
      maxConnections: l.maxConnections ?? 1,
      status: l.status ?? "ACTIVE",
      notes: l.notes ?? "",
      allowedIps: l.allowedIps ?? "",
      lockToIp: l.lockToIp ?? false,
      canWatchAdult: l.canWatchAdult ?? false,
      allowedCountries: l.allowedCountries ?? "",
      blockedCountries: l.blockedCountries ?? "",
      allowedOutput: l.allowedOutput ?? "",
      ownerLegacyId: l.ownerLegacyId ?? "",
    }));
  }

  // Streams → snapshot.streams
  if (bundle.streams?.length) {
    snapshot.streams = bundle.streams.map((s) => ({
      id: s.legacyId,
      name: s.name,
      streamUrl: s.streamUrl,
      type: s.type ?? "LIVE",
      sortOrder: s.sortOrder ?? 0,
      streamIcon: s.streamIcon ?? "",
      epgChannelId: s.epgChannelId ?? "",
      channelId: s.channelId ?? "",
      containerExtension: s.containerExtension ?? "",
      isActive: s.isActive ?? true,
    }));
  }

  // Bouquets → snapshot.bouquets (with stream links)
  if (bundle.bouquets?.length) {
    snapshot.bouquets = bundle.bouquets.map((b) => ({
      id: b.legacyId,
      name: b.name,
      sortOrder: b.sortOrder ?? 0,
      isActive: true,
      streams: b.streamLegacyIds?.map((sid) => ({ streamId: sid })) ?? [],
    }));
  }

  // Resellers → snapshot.users (panel admin users)
  if (bundle.resellers?.length) {
    snapshot.users = bundle.resellers.map((r) => ({
      id: r.legacyId ?? r.username,
      username: r.username,
      password: r.password,
      role: "RESELLER",
      credits: r.credits ?? 0,
      isActive: r.isActive ?? true,
    }));
  }

  // MAG devices — attach to lines
  if (bundle.magDevices?.length) {
    const lines = (snapshot.lines as Record<string, unknown>[]) ?? [];
    for (const mag of bundle.magDevices) {
      const line = lines.find((l) => l.username === mag.lineUsername);
      if (line) {
        line.magMac = mag.mac;
      }
    }
  }

  // Phase 2: categories, servers, epg
  if (bundle.phase2) {
    if (bundle.phase2.categories?.length) {
      snapshot.categories = bundle.phase2.categories.map((c) => ({
        id: c.legacyId,
        name: c.name,
        parentId: c.parentLegacyId ?? null,
        categoryType: "LIVE",
        sortOrder: 0,
        isAdult: false,
      }));
    }
    if (bundle.phase2.servers?.length) {
      // Servers are handled by migration engine directly, include as info
      (snapshot as any)._servers = bundle.phase2.servers;
    }
    if (bundle.phase2.epgSources?.length) {
      snapshot.epgSources = bundle.phase2.epgSources.map((e) => ({
        id: e.name,
        name: e.name,
        url: e.url,
        country: e.country ?? "",
      }));
    }
  }

  return snapshot;
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ message: "Use POST with action=restore" });
}
