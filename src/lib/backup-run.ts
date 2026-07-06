import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { gzipSync, gunzipSync } from "zlib";

const ALGORITHM = "aes-256-gcm";

function deriveKey(password: string, salt: Buffer): Buffer {
  // Simple key derivation — for production use scrypt/pbkdf2
  return createHash("sha256").update(password).update(salt).digest();
}

export function encryptBackup(data: string, password: string): Buffer {
  const salt = randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: salt(16) + iv(12) + tag(16) + encrypted
  return Buffer.concat([salt, iv, tag, encrypted]);
}

export function decryptBackup(encrypted: Buffer, password: string): string {
  const salt = encrypted.subarray(0, 16);
  const iv = encrypted.subarray(16, 28);
  const tag = encrypted.subarray(28, 44);
  const data = encrypted.subarray(44);
  const key = deriveKey(password, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function computeChecksum(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function buildFullBackupSnapshot(options?: { includePasswords?: boolean }) {
  const [panelSettings, bouquets, categories, streams, lines, users, packages, coupons, epgSources] =
    await Promise.all([
      prisma.panelSetting.findMany(),
      prisma.bouquet.findMany({ include: { streams: true } }),
      prisma.category.findMany(),
      prisma.stream.findMany(),
      prisma.line.findMany({ include: { bouquets: true } }),
      prisma.panelUser.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          credits: true,
          email: true,
          displayName: true,
          isActive: true,
          maxLines: true,
          groupId: true,
          parentId: true,
          resellerDns: true,
          defaultLanguage: true,
        },
      }),
      prisma.package.findMany(),
      prisma.coupon.findMany(),
      prisma.epgSource.findMany(),
    ]);

  return {
    version: 3,
    createdAt: new Date().toISOString(),
    panelSettings,
    bouquets,
    categories,
    streams,
    lines: options?.includePasswords
      ? lines
      : lines.map((l) => ({ ...l, password: "[redacted-export]" })),
    users,
    packages,
    coupons,
    epgSources,
    counts: {
      streams: streams.length,
      lines: lines.length,
      users: users.length,
      bouquets: bouquets.length,
    },
  };
}

export async function runPanelBackup() {
  const backup = await getSettingGroup("backup");
  if (!backup.enabled) return { skipped: true as const, reason: "disabled" };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const includePasswords = backup.includePasswords === true;
  const snapshot = backup.fullExportOnBackup
    ? await buildFullBackupSnapshot({ includePasswords })
    : {
        createdAt: new Date().toISOString(),
        panelSettings: await prisma.panelSetting.findMany(),
        counts: {
          streams: await prisma.stream.count(),
          lines: await prisma.line.count(),
          users: await prisma.panelUser.count(),
          bouquets: await prisma.bouquet.count(),
        },
      };

  const filename = `nexlify-backup-${stamp}.json`;
  const payload = JSON.stringify(snapshot, null, 2);
  const checksum = computeChecksum(payload);

  const { mkdir, writeFile } = await import("fs/promises");
  const path = await import("path");
  const rawPath = String(backup.localPath ?? "").trim();
  const dir = path.resolve(
    process.cwd(),
    rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"
  );
  await mkdir(dir, { recursive: true });

  // Encryption
  const encryptionPassword = String(backup.encryptionPassword ?? "").trim();
  let fileContent: string | Buffer = payload;
  let ext = "json";

  if (encryptionPassword) {
    fileContent = encryptBackup(payload, encryptionPassword);
    ext = "json.enc";
  }

  const filePath = path.join(dir, filename.replace(".json", `.${ext}`));
  await writeFile(filePath, fileContent);

  // Write checksum sidecar
  await writeFile(`${filePath}.sha256`, checksum, "utf8");

  return {
    skipped: false as const,
    path: filePath,
    checksum,
    encrypted: Boolean(encryptionPassword),
    size: Buffer.isBuffer(fileContent) ? fileContent.length : Buffer.byteLength(fileContent),
  };
}
