import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getSettingGroup } from "@/lib/panel-settings";
import { PanelRole } from "@prisma/client";
import { mkdir, readdir, stat, unlink, readFile } from "fs/promises";
import path from "path";
import { createReadStream } from "fs";
import { Readable } from "stream";
import { restoreFullBackup } from "@/lib/backup-restore";
import { computeChecksum, decryptBackup } from "@/lib/backup-run";
import {
  reconcileBackupJob,
  startBackupBackgroundJob,
  type BackupJob,
} from "@/lib/backup-job";

function backupDirFromSettings(backup: { localPath?: unknown }) {
  const rawPath = String(backup.localPath ?? "").trim();
  return path.resolve(
    process.cwd(),
    rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"
  );
}

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const backup = await getSettingGroup("backup");
  const dir = backupDirFromSettings(backup);

  const jobParam = req.nextUrl.searchParams.get("job");
  if (jobParam === "1" || jobParam === "status") {
    const job = await reconcileBackupJob();
    return NextResponse.json({ job });
  }

  // If ?file= param, read and return the backup file content (or download)
  const fileParam = req.nextUrl.searchParams.get("file");
  if (fileParam) {
    const filePath = path.join(dir, path.basename(fileParam));
    const download = req.nextUrl.searchParams.get("download") === "1";
    try {
      const s = await stat(filePath);
      if (download) {
        const stream = createReadStream(filePath);
        const webStream = Readable.toWeb(stream) as unknown as ReadableStream;
        return new NextResponse(webStream, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${path.basename(filePath)}"`,
            "Content-Length": String(s.size),
          },
        });
      }

      // Avoid loading multi-GB backups into memory for JSON preview
      if (s.size > 32 * 1024 * 1024) {
        return NextResponse.json({
          error: "Backup file is too large to preview in the browser. Use Download, then Upload Backup to restore.",
          size: s.size,
          name: path.basename(filePath),
        }, { status: 413 });
      }

      if (filePath.endsWith(".enc")) {
        return NextResponse.json({
          encrypted: true,
          name: path.basename(filePath),
          size: s.size,
          message: "Encrypted backup — provide password when restoring via upload.",
        });
      }

      if (filePath.endsWith(".gz") || filePath.endsWith(".zip")) {
        const buf = await readFile(filePath);
        return new NextResponse(buf, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${path.basename(filePath)}"`,
          },
        });
      }

      const content = await readFile(filePath, "utf-8");
      try {
        const snapshot = JSON.parse(content);
        return NextResponse.json({ snapshot });
      } catch {
        return NextResponse.json({ raw: content });
      }
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  }

  // List local backup files
  let backups: {
    id: string;
    name: string;
    createdAt: number;
    size: number;
    status: string;
    includes: string[];
  }[] = [];
  try {
    const files = await readdir(dir);
    const backupFiles = files.filter(
      (f) => f.startsWith("nexlify-backup-") && !f.endsWith(".sha256")
    );
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
          includes: [
            "settings",
            "bouquets",
            "categories",
            "streams",
            "lines",
            "users",
            "packages",
            "coupons",
            "epgSources",
          ],
        };
      })
    );
    backups = stats.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    // Directory doesn't exist yet
  }

  const job = await reconcileBackupJob();
  return NextResponse.json({ backup, backups, job });
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

  const includePasswords =
    req.nextUrl.searchParams.get("passwords") === "true" || backup.includePasswords === true;
  const target = backup.target === "remote" ? "remote" : "local";
  const triggerParam = req.nextUrl.searchParams.get("trigger");
  const trigger =
    triggerParam === "settings" || triggerParam === "cron" ? triggerParam : "manual";

  // Ensure backup directory exists early so listing works while job runs
  if (target === "local") {
    await mkdir(backupDirFromSettings(backup), { recursive: true });
  }

  const started = await startBackupBackgroundJob({
    trigger,
    format,
    includePasswords,
    target,
  });

  if (!started.ok) {
    return NextResponse.json({ error: started.error, job: started.job }, { status: 409 });
  }

  const job: BackupJob = started.job;
  return NextResponse.json({
    ok: true,
    async: true,
    alreadyRunning: Boolean(started.alreadyRunning),
    jobId: job.id,
    job,
    message: started.alreadyRunning
      ? "A backup is already in progress — showing live status."
      : "Backup started in the background. Progress will update until complete.",
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

  if (body.encrypted && body.data && body.password) {
    try {
      const decrypted = decryptBackup(Buffer.from(body.data, "base64"), body.password);
      snapshot = JSON.parse(decrypted);
    } catch {
      return NextResponse.json(
        { error: "Decryption failed — wrong password or corrupted data" },
        { status: 400 }
      );
    }
  }

  if (body.checksum && body.snapshot) {
    const actualChecksum = computeChecksum(JSON.stringify(body.snapshot, null, 2));
    if (actualChecksum !== body.checksum) {
      return NextResponse.json(
        { error: "Checksum mismatch — backup may be corrupted" },
        { status: 400 }
      );
    }
  }

  if (!snapshot && Array.isArray(body.panelSettings)) {
    snapshot = { panelSettings: body.panelSettings };
  }

  if (!snapshot) {
    return NextResponse.json(
      { error: "Invalid backup: snapshot or panelSettings array required" },
      { status: 400 }
    );
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
    message:
      result.errors.length === 0
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
  const dir = backupDirFromSettings(backup);
  const filePath = path.join(dir, path.basename(id));
  try {
    await unlink(filePath);
    try {
      await unlink(`${filePath}.sha256`);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true, message: "Backup deleted" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}
