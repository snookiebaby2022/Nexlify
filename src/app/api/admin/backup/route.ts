import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getSettingGroup } from "@/lib/panel-settings";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { mkdir, readdir, stat, unlink, readFile } from "fs/promises";
import path from "path";
import { buildFullBackupSnapshot } from "@/lib/backup-run";
import { writeBackupArchive } from "@/lib/backup-archive";
import { restoreFullBackup } from "@/lib/backup-restore";
import { computeChecksum, decryptBackup } from "@/lib/backup-run";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const backup = await getSettingGroup("backup");

  const rawPath = String(backup.localPath ?? "").trim();
  const dir = path.resolve(
    process.cwd(),
    rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"
  );

  // If ?file= param, read and return the backup file content
  const fileParam = req.nextUrl.searchParams.get("file");
  if (fileParam) {
    const filePath = path.join(dir, path.basename(fileParam));
    try {
      const content = await readFile(filePath, "utf-8");
      // Try to parse as JSON
      try {
        const snapshot = JSON.parse(content);
        return NextResponse.json({ snapshot });
      } catch {
        // Not JSON (might be gzip/zip) — return raw
        return NextResponse.json({ raw: content });
      }
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  }

  // List local backup files
  let backups: { id: string; name: string; createdAt: number; size: number; status: string; includes: string[] }[] = [];
  try {
    const files = await readdir(dir);
    const backupFiles = files.filter((f) => f.startsWith("nexlify-backup-"));
    const stats = await Promise.all(
      backupFiles.map(async (f) => {
        const filePath = path.join(dir, f);
        const s = await stat(filePath);
        return {
          id: f,
          name: f,
          createdAt: s.mtimeMs,
          size: s.size,
          status: "completed" as const,
          includes: ["settings", "bouquets", "categories", "streams", "lines", "users", "packages", "coupons", "epgSources"],
        };
      })
    );
    backups = stats.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    // Directory doesn't exist yet
  }

  return NextResponse.json({ backup, backups });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const backup = await getSettingGroup("backup");
  const formatParam = req.nextUrl.searchParams.get("format");
  const format =
    formatParam === "zip" || formatParam === "gzip"
      ? formatParam
      : backup.exportFormat === "zip"
        ? "zip"
        : backup.exportFormat === "gzip"
          ? "gzip"
          : "json";

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const includePasswords = req.nextUrl.searchParams.get("passwords") === "true" || backup.includePasswords === true;
  const snapshot = await buildFullBackupSnapshot({ includePasswords });
  const payload = JSON.stringify(snapshot, null, 2);
  const checksum = computeChecksum(payload);
  const baseName = `nexlify-backup-${stamp}`;
  const target = backup.target === "remote" ? "remote" : "local";

  if (target === "local") {
    const rawPath = String(backup.localPath ?? "").trim();
    const dir = path.resolve(
      process.cwd(),
      rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"
    );
    await mkdir(dir, { recursive: true });
    const { filePath, format: writtenFormat } = await writeBackupArchive(dir, baseName, payload, format);
    return NextResponse.json({
      ok: true,
      target: "local",
      path: filePath,
      format: writtenFormat,
      checksum,
      full: true,
      includePasswords,
      message: `Full panel backup written (${writtenFormat})`,
    });
  }

  return NextResponse.json({
    ok: true,
    target: "remote",
    filename: `${baseName}.${format === "json" ? "json" : format === "zip" ? "zip" : "json.gz"}`,
    format,
    checksum,
    full: true,
    message: "Remote backup settings saved. Download via Run backup or SFTP.",
    remote: {
      protocol: backup.remoteProtocol,
      host: backup.remoteHost,
      path: backup.remotePath,
    },
    snapshotSize: payload.length,
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const backup = await getSettingGroup("backup");
  if (!backup.allowRestoreUpload) {
    return NextResponse.json({ error: "Restore upload disabled in settings" }, { status: 403 });
  }

  const body = await req.json();
  let snapshot = body.snapshot as Record<string, unknown> | undefined;

  // Handle encrypted backups
  if (body.encrypted && body.data && body.password) {
    try {
      const decrypted = decryptBackup(Buffer.from(body.data, "base64"), body.password);
      snapshot = JSON.parse(decrypted);
    } catch {
      return NextResponse.json({ error: "Decryption failed — wrong password or corrupted data" }, { status: 400 });
    }
  }

  // Handle checksum verification
  if (body.checksum && body.snapshot) {
    const actualChecksum = computeChecksum(JSON.stringify(body.snapshot, null, 2));
    if (actualChecksum !== body.checksum) {
      return NextResponse.json({ error: "Checksum mismatch — backup may be corrupted" }, { status: 400 });
    }
  }

  // Support legacy settings-only restore
  if (!snapshot && Array.isArray(body.panelSettings)) {
    snapshot = { panelSettings: body.panelSettings };
  }

  if (!snapshot) {
    return NextResponse.json({ error: "Invalid backup: snapshot or panelSettings array required" }, { status: 400 });
  }

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
      ? "Full backup restored successfully."
      : `Restored with ${result.errors.length} error(s). Check errors array.`,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const backup = await getSettingGroup("backup");
  const rawPath = String(backup.localPath ?? "").trim();
  const dir = path.resolve(
    process.cwd(),
    rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"
  );

  const filePath = path.join(dir, path.basename(id));
  try {
    await unlink(filePath);
    return NextResponse.json({ ok: true, message: "Backup deleted" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}
