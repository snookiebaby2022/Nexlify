import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { restoreFullBackup } from "@/lib/backup-restore";
import { decryptBackup, computeChecksum } from "@/lib/backup-run";
import { readFile } from "fs/promises";
import path from "path";

/**
 * POST /api/admin/disaster-recovery
 * 
 * One-click disaster recovery:
 * 1. Verify system health
 * 2. Restore from backup file
 * 3. Validate restoration
 */
export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action } = body;

  // Health check
  if (action === "health-check") {
    const checks = await runHealthCheck();
    return NextResponse.json(checks);
  }

  // Restore from backup file path
  if (action === "restore-from-file") {
    const { filePath, password, checksum: expectedChecksum } = body;
    if (!filePath) {
      return NextResponse.json({ error: "filePath required" }, { status: 400 });
    }

    try {
      let raw = await readFile(filePath, "utf8");

      // Handle encrypted backups
      if (password && filePath.endsWith(".enc")) {
        const encrypted = await readFile(filePath);
        raw = decryptBackup(encrypted, password);
      }

      // Verify checksum if provided
      if (expectedChecksum) {
        const actual = computeChecksum(raw);
        if (actual !== expectedChecksum) {
          return NextResponse.json({
            ok: false,
            error: "Checksum mismatch — backup may be corrupted",
            expected: expectedChecksum,
            actual,
          }, { status: 400 });
        }
      }

      const snapshot = JSON.parse(raw);
      const result = await restoreFullBackup(snapshot);

      return NextResponse.json({
        ok: result.errors.length === 0,
        restored: {
          settings: result.settings,
          bouquets: result.bouquets,
          categories: result.categories,
          streams: result.streams,
          lines: result.lines,
          users: result.users,
          packages: result.packages,
          coupons: result.coupons,
          epgSources: result.epgSources,
        },
        errors: result.errors,
        message: result.errors.length === 0
          ? "Disaster recovery complete — all data restored."
          : `Recovery completed with ${result.errors.length} error(s).`,
      });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: `Recovery failed: ${e instanceof Error ? e.message : String(e)}`,
      }, { status: 500 });
    }
  }

  // Restore from latest backup
  if (action === "restore-latest") {
    try {
      const backup = await getSettingGroup("backup");
      const rawPath = String(backup.localPath ?? "").trim();
      const dir = path.resolve(
        process.cwd(),
        rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"
      );

      // Find latest backup file
      const { readdirSync } = await import("fs");
      const files = readdirSync(dir)
        .filter((f) => f.startsWith("nexlify-backup-") && (f.endsWith(".json") || f.endsWith(".json.gz")))
        .sort()
        .reverse();

      if (files.length === 0) {
        return NextResponse.json({ ok: false, error: "No backups found" }, { status: 404 });
      }

      const latestFile = path.join(dir, files[0]);
      const raw = await readFile(latestFile, "utf8");
      const snapshot = JSON.parse(raw);
      const result = await restoreFullBackup(snapshot);

      return NextResponse.json({
        ok: result.errors.length === 0,
        restoredFrom: files[0],
        restored: {
          settings: result.settings,
          bouquets: result.bouquets,
          categories: result.categories,
          streams: result.streams,
          lines: result.lines,
          users: result.users,
          packages: result.packages,
          coupons: result.coupons,
          epgSources: result.epgSources,
        },
        errors: result.errors,
      });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: `Recovery failed: ${e instanceof Error ? e.message : String(e)}`,
      }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

async function runHealthCheck() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (e) {
    checks.database = { ok: false, detail: e instanceof Error ? e.message : "Connection failed" };
  }

  // Settings table
  try {
    const count = await prisma.panelSetting.count();
    checks.settings = { ok: true, detail: `${count} settings` };
  } catch (e) {
    checks.settings = { ok: false, detail: "Settings table missing" };
  }

  // Streams
  try {
    const count = await prisma.stream.count();
    checks.streams = { ok: true, detail: `${count} streams` };
  } catch (e) {
    checks.streams = { ok: false, detail: "Streams table missing" };
  }

  // Lines
  try {
    const count = await prisma.line.count();
    checks.lines = { ok: true, detail: `${count} lines` };
  } catch (e) {
    checks.lines = { ok: false, detail: "Lines table missing" };
  }

  // Users
  try {
    const count = await prisma.panelUser.count();
    checks.users = { ok: true, detail: `${count} users` };
  } catch (e) {
    checks.users = { ok: false, detail: "Users table missing" };
  }

  // Backups available
  try {
    const backup = await getSettingGroup("backup");
    const rawPath = String(backup.localPath ?? "").trim();
    const dir = path.resolve(
      process.cwd(),
      rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"
    );
    const { readdirSync } = await import("fs");
    const files = readdirSync(dir).filter((f) => f.startsWith("nexlify-backup-"));
    checks.backups = { ok: files.length > 0, detail: `${files.length} backup(s) available` };
  } catch {
    checks.backups = { ok: false, detail: "No backups directory" };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return { healthy: allOk, checks };
}
