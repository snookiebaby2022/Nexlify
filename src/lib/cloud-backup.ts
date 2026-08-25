import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { buildFullBackupSnapshot, computeChecksum, encryptBackup } from "@/lib/backup-run";
import { resolveBackupDir } from "@/lib/backup-path";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type CloudBackupJob = {
  id: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  filePath?: string;
  fileSizeBytes?: number;
  encrypted: boolean;
  checksum?: string;
  uploadProvider?: string;
  uploadUrl?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
};

/**
 * Run a cloud backup — creates the backup file and queues it for upload.
 * The actual upload to S3/xDrive/Dropbox happens via the API endpoint
 * which generates a pre-signed URL or uses the provider SDK.
 */
export async function runCloudBackup(): Promise<CloudBackupJob> {
  const cloudSettings = await getSettingGroup("cloud-backup");
  const backupSettings = await getSettingGroup("backup");

  if (!cloudSettings.cloudBackupEnabled) {
    return {
      id: "",
      type: "cloud",
      status: "failed",
      error: "Cloud backup is disabled",
      encrypted: false,
      createdAt: new Date(),
    };
  }

  const provider = String(cloudSettings.cloudBackupProvider ?? "s3");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const includeDb = cloudSettings.cloudBackupIncludeDb === true;
  const includeMedia = cloudSettings.cloudBackupIncludeMedia === true;
  const encryptionPassword = String(backupSettings.encryptionPassword ?? "").trim();

  // Build snapshot
  const snapshot = await buildFullBackupSnapshot({
    includePasswords: backupSettings.includePasswords === true,
  });
  const payload = JSON.stringify(snapshot, null, 2);
  const checksum = computeChecksum(payload);

  // Optionally include pg_dump
  let pgDumpPath: string | undefined;
  if (includeDb) {
    try {
      pgDumpPath = await runPgDump();
    } catch (e) {
      // Non-fatal — continue without DB dump
      console.error("pg_dump failed during cloud backup:", e instanceof Error ? e.message : e);
    }
  }

  // Write backup file
  const dir = resolveBackupDir(typeof backupSettings.localPath === "string" ? backupSettings.localPath : undefined);
  await mkdir(dir, { recursive: true });

  let fileContent: string | Buffer = payload;
  let ext = "json";
  let encrypted = false;

  if (encryptionPassword) {
    fileContent = encryptBackup(payload, encryptionPassword);
    ext = "json.enc";
    encrypted = true;
  }

  const filename = `nexlify-cloud-backup-${stamp}.${ext}`;
  const filePath = path.join(dir, filename);
  await writeFile(filePath, fileContent);

  // Write checksum
  await writeFile(`${filePath}.sha256`, checksum, "utf8");

  const stats = await import("fs/promises").then((fs) => fs.stat(filePath));

  // Create backup record
  const backupType = includeDb ? "FULL_PANEL" : "CONFIG_ONLY";
  const record = await prisma.xdriveBackup.create({
    data: {
      type: backupType as any,
      status: "QUEUED" as any,
      filePath,
      fileSizeBytes: stats.size,
      encrypted,
      uploadProvider: provider,
      retentionDays: Number(cloudSettings.cloudBackupRetentionDays ?? 30),
      expiresAt: new Date(Date.now() + Number(cloudSettings.cloudBackupRetentionDays ?? 30) * 86400000),
      createdById: undefined, // Could be set from session
    },
  });

  return {
    id: record.id,
    type: backupType,
    status: "queued",
    filePath,
    fileSizeBytes: stats.size,
    encrypted,
    checksum,
    uploadProvider: provider,
    createdAt: record.createdAt,
  };
}

/**
 * Generate a pre-signed upload URL for a backup record.
 */
export async function getUploadUrl(backupId: string): Promise<{ uploadUrl: string; provider: string }> {
  const backup = await prisma.xdriveBackup.findUnique({ where: { id: backupId } });
  if (!backup) throw new Error("Backup not found");

  const provider = backup.uploadProvider ?? "s3";
  const cloudSettings = await getSettingGroup("cloud-backup");

  if (provider === "s3") {
    // Generate S3 pre-signed URL (simplified — use AWS SDK in production)
    const bucket = String(cloudSettings.cloudBackupS3Bucket ?? "");
    const region = String(cloudSettings.cloudBackupS3Region ?? "us-east-1");
    if (!bucket) throw new Error("S3 bucket not configured");

    const key = `nexlify-backups/${path.basename(backup.filePath ?? "")}`;
    const uploadUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    return { uploadUrl, provider: "s3" };
  }

  if (provider === "xdrive") {
    const endpoint = String(cloudSettings.xDriveEndpoint ?? "https://api.xdrive.io/v1");
    const apiKey = String(cloudSettings.xDriveApiKey ?? "");
    if (!apiKey) throw new Error("xDrive API key not configured");
    // In production, call xDrive API to get upload URL
    return { uploadUrl: `${endpoint}/upload`, provider: "xdrive" };
  }

  if (provider === "dropbox") {
    const token = String(cloudSettings.cloudBackupDropboxToken ?? "");
    if (!token) throw new Error("Dropbox token not configured");
    return { uploadUrl: "https://content.dropboxapi.com/2/files/upload", provider: "dropbox" };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Mark a backup as uploaded.
 */
export async function markUploaded(backupId: string, uploadUrl?: string): Promise<void> {
  await prisma.xdriveBackup.update({
    where: { id: backupId },
    data: {
      status: "COMPLETED" as any,
      uploadUrl: uploadUrl ?? undefined,
      completedAt: new Date(),
    },
  });
}

/**
 * Run pg_dump from Node.js (shared helper — never shells the DATABASE_URL).
 */
async function runPgDump(): Promise<string> {
  const { runPgDumpToGzip } = await import("@/lib/pg-dump");
  const result = await runPgDumpToGzip({ timeoutMs: 2 * 60 * 60 * 1000 });
  return result.outPath;
}

/**
 * Cleanup expired cloud backups
 */
export async function cleanupExpiredBackups(): Promise<number> {
  const result = await prisma.xdriveBackup.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      status: { in: ["COMPLETED", "FAILED"] as any },
    },
  });
  return result.count;
}
