import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { createHash, randomBytes, createCipheriv, createDecipheriv, type Hash } from "crypto";
import { createWriteStream } from "fs";
import { once } from "events";
import { createGzip } from "zlib";
import { writeBackupArchive } from "@/lib/backup-archive";

const ALGORITHM = "aes-256-gcm";

export type BackupProgressCb = (phase: string, current: number, total: number) => void;

function deriveKey(password: string, salt: Buffer): Buffer {
  return createHash("sha256").update(password).update(salt).digest();
}

export function encryptBackup(data: string, password: string): Buffer {
  const salt = randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
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

const STREAM_BATCH = 2500;
const LINE_BATCH = 1000;
/** Above this, never build a single JSON string (V8 max string length). */
const STREAM_INLINE_LIMIT = 25_000;

async function loadStreamsBatched(onProgress?: BackupProgressCb) {
  const total = await prisma.stream.count();
  onProgress?.("streams", 0, Math.max(total, 1));
  if (total === 0) return [];

  const streams: Awaited<ReturnType<typeof prisma.stream.findMany>> = [];
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.stream.findMany({
      take: STREAM_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (!batch.length) break;
    streams.push(...batch);
    cursor = batch[batch.length - 1]!.id;
    onProgress?.("streams", streams.length, total);
    if (batch.length < STREAM_BATCH) break;
  }
  return streams;
}

async function loadLinesBatched(includePasswords: boolean, onProgress?: BackupProgressCb) {
  const total = await prisma.line.count();
  onProgress?.("lines", 0, Math.max(total, 1));
  if (total === 0) return [];

  const lines: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.line.findMany({
      take: LINE_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      include: { bouquets: true },
    });
    if (!batch.length) break;
    for (const l of batch) {
      lines.push(includePasswords ? l : { ...l, password: "[redacted-export]" });
    }
    cursor = batch[batch.length - 1]!.id;
    onProgress?.("lines", lines.length, total);
    if (batch.length < LINE_BATCH) break;
  }
  return lines;
}

export async function buildFullBackupSnapshot(options?: {
  includePasswords?: boolean;
  onProgress?: BackupProgressCb;
}) {
  const onProgress = options?.onProgress;
  onProgress?.("meta", 0, 8);

  const [panelSettings, bouquets, categories, users, packages, coupons, epgSources] =
    await Promise.all([
      prisma.panelSetting.findMany(),
      prisma.bouquet.findMany({ include: { streams: true } }),
      prisma.category.findMany(),
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
  onProgress?.("meta", 4, 8);

  const streams = await loadStreamsBatched(onProgress);
  onProgress?.("meta", 6, 8);
  const lines = await loadLinesBatched(options?.includePasswords === true, onProgress);
  onProgress?.("meta", 8, 8);

  return {
    version: 3,
    createdAt: new Date().toISOString(),
    panelSettings,
    bouquets,
    categories,
    streams,
    lines,
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

export type WritePanelBackupResult = {
  skipped: false;
  path: string;
  checksum: string;
  encrypted: boolean;
  size: number;
  format: string;
};

type ChunkSink = {
  write: (chunk: string) => Promise<void>;
  end: () => Promise<void>;
  bytes: () => number;
  digest: () => string;
};

function createJsonSink(filePath: string, gzip: boolean): ChunkSink {
  const hash: Hash = createHash("sha256");
  let bytes = 0;
  const file = createWriteStream(filePath);
  let dest: NodeJS.WritableStream = file;
  if (gzip) {
    const gz = createGzip({ level: 6 });
    gz.pipe(file);
    dest = gz;
  }

  return {
    async write(chunk: string) {
      hash.update(chunk);
      bytes += Buffer.byteLength(chunk);
      if (!dest.write(chunk)) {
        await once(dest, "drain");
      }
    },
    async end() {
      await new Promise<void>((resolve, reject) => {
        const onErr = (e: Error) => reject(e);
        file.once("error", onErr);
        dest.once("error", onErr);
        file.once("finish", () => resolve());
        dest.end();
      });
    },
    bytes: () => bytes,
    digest: () => hash.digest("hex"),
  };
}

async function writeJsonArrayStreaming(
  sink: ChunkSink,
  key: string,
  total: number,
  fetchBatch: (
    cursor: string | undefined,
    take: number
  ) => Promise<{ rows: unknown[]; nextCursor?: string }>,
  batchSize: number,
  onProgress?: BackupProgressCb,
  phase = "streams"
) {
  await sink.write(`"${key}":[`);
  let written = 0;
  let cursor: string | undefined;
  let first = true;
  onProgress?.(phase, 0, Math.max(total, 1));
  while (true) {
    const { rows, nextCursor } = await fetchBatch(cursor, batchSize);
    if (!rows.length) break;
    for (const row of rows) {
      if (!first) await sink.write(",");
      first = false;
      await sink.write(JSON.stringify(row));
      written += 1;
    }
    onProgress?.(phase, written, Math.max(total, 1));
    cursor = nextCursor;
    if (!nextCursor || rows.length < batchSize) break;
  }
  await sink.write("]");
  return written;
}

/**
 * Stream a full panel backup to disk — never builds one giant JSON string
 * (avoids V8 "Invalid string length" on ~500k-stream catalogs).
 */
async function writeFullBackupStreaming(options: {
  dir: string;
  baseName: string;
  format: "json" | "zip" | "gzip";
  includePasswords: boolean;
  encryptionPassword: string;
  onProgress?: BackupProgressCb;
}): Promise<WritePanelBackupResult> {
  const { dir, baseName, includePasswords, onProgress } = options;
  const { mkdir, writeFile, stat } = await import("fs/promises");
  const path = await import("path");
  await mkdir(dir, { recursive: true });

  // zip of multi-GB payloads is impractical; gzip streams; else plain json
  const useGzip = options.format === "gzip" || options.format === "zip";
  const filePath = path.join(dir, useGzip ? `${baseName}.json.gz` : `${baseName}.json`);
  const sink = createJsonSink(filePath, useGzip);

  onProgress?.("building", 0, 100);

  const [panelSettings, bouquets, categories, users, packages, coupons, epgSources, streamTotal, lineTotal] =
    await Promise.all([
      prisma.panelSetting.findMany(),
      prisma.bouquet.findMany({ include: { streams: true } }),
      prisma.category.findMany(),
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
      prisma.stream.count(),
      prisma.line.count(),
    ]);

  onProgress?.("writing", 5, 100);
  await sink.write(`{"version":3,"createdAt":${JSON.stringify(new Date().toISOString())},`);
  await sink.write(`"panelSettings":${JSON.stringify(panelSettings)},`);
  await sink.write(`"bouquets":${JSON.stringify(bouquets)},`);
  await sink.write(`"categories":${JSON.stringify(categories)},`);
  await sink.write(`"users":${JSON.stringify(users)},`);
  await sink.write(`"packages":${JSON.stringify(packages)},`);
  await sink.write(`"coupons":${JSON.stringify(coupons)},`);
  await sink.write(`"epgSources":${JSON.stringify(epgSources)},`);

  const streamsWritten = await writeJsonArrayStreaming(
    sink,
    "streams",
    streamTotal,
    async (cursor, take) => {
      const batch = await prisma.stream.findMany({
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
      });
      return {
        rows: batch,
        nextCursor: batch.length ? batch[batch.length - 1]!.id : undefined,
      };
    },
    STREAM_BATCH,
    onProgress,
    "streams"
  );

  await sink.write(",");

  const linesWritten = await writeJsonArrayStreaming(
    sink,
    "lines",
    lineTotal,
    async (cursor, take) => {
      const batch = await prisma.line.findMany({
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        include: { bouquets: true },
      });
      const rows = includePasswords
        ? batch
        : batch.map((l) => ({ ...l, password: "[redacted-export]" }));
      return {
        rows,
        nextCursor: batch.length ? batch[batch.length - 1]!.id : undefined,
      };
    },
    LINE_BATCH,
    onProgress,
    "lines"
  );

  await sink.write(
    `,"counts":{"streams":${streamsWritten},"lines":${linesWritten},"users":${users.length},"bouquets":${bouquets.length}}}`
  );
  await sink.end();

  const checksum = sink.digest();
  await writeFile(`${filePath}.sha256`, checksum, "utf8");

  // Encryption of multi-GB backups cannot be done in-memory; leave plaintext + sidecar checksum.
  if (options.encryptionPassword) {
    onProgress?.("encrypting", 98, 100);
    // Best-effort note file so admins know why .enc was not produced
    await writeFile(
      `${filePath}.encryption-skipped.txt`,
      "Encryption skipped for large streaming backups (file too large for in-memory AES). SHA-256 sidecar is present.\n",
      "utf8"
    );
  }

  const size = (await stat(filePath)).size;
  onProgress?.("done", 100, 100);

  return {
    skipped: false,
    path: filePath,
    checksum,
    encrypted: false,
    size,
    format: useGzip ? "gzip" : "json",
  };
}

/**
 * Build and write a full (or light) panel backup to disk.
 * Used by cron, the API background worker, and tests.
 */
export async function writePanelBackupFile(options?: {
  includePasswords?: boolean;
  fullExport?: boolean;
  format?: "json" | "zip" | "gzip";
  onProgress?: BackupProgressCb;
}): Promise<WritePanelBackupResult> {
  const backup = await getSettingGroup("backup");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const includePasswords = options?.includePasswords ?? backup.includePasswords === true;
  const fullExport = options?.fullExport ?? backup.fullExportOnBackup !== false;
  const format =
    options?.format === "zip" || options?.format === "gzip" || options?.format === "json"
      ? options.format
      : backup.exportFormat === "zip"
        ? "zip"
        : backup.exportFormat === "gzip"
          ? "gzip"
          : "json";

  const { mkdir, writeFile } = await import("fs/promises");
  const path = await import("path");
  const rawPath = String(backup.localPath ?? "").trim();
  const dir = path.resolve(
    process.cwd(),
    rawPath && !rawPath.startsWith("(") ? rawPath.replace(/^\.\//, "") : "./backups"
  );
  await mkdir(dir, { recursive: true });
  const baseName = `nexlify-backup-${stamp}`;
  const encryptionPassword = String(backup.encryptionPassword ?? "").trim();

  if (!fullExport) {
    options?.onProgress?.("building", 0, 100);
    const snapshot = {
      createdAt: new Date().toISOString(),
      panelSettings: await prisma.panelSetting.findMany(),
      counts: {
        streams: await prisma.stream.count(),
        lines: await prisma.line.count(),
        users: await prisma.panelUser.count(),
        bouquets: await prisma.bouquet.count(),
      },
    };
    const payload = JSON.stringify(snapshot);
    const checksum = computeChecksum(payload);
    const filePath = path.join(dir, `${baseName}.json`);
    await writeFile(filePath, payload, "utf8");
    await writeFile(`${filePath}.sha256`, checksum, "utf8");
    options?.onProgress?.("done", 100, 100);
    return {
      skipped: false,
      path: filePath,
      checksum,
      encrypted: false,
      size: Buffer.byteLength(payload),
      format: "json",
    };
  }

  const streamCount = await prisma.stream.count();
  // Always stream when the catalog can exceed V8 string limits / proxy memory.
  if (streamCount >= STREAM_INLINE_LIMIT) {
    return writeFullBackupStreaming({
      dir,
      baseName,
      format,
      includePasswords,
      encryptionPassword,
      onProgress: options?.onProgress,
    });
  }

  options?.onProgress?.("building", 0, 100);
  const snapshot = await buildFullBackupSnapshot({
    includePasswords,
    onProgress: (phase, current, total) => {
      if (phase === "streams") options?.onProgress?.("streams", current, total);
      else if (phase === "lines") options?.onProgress?.("lines", current, total);
      else
        options?.onProgress?.(
          "building",
          Math.min(90, Math.round((current / Math.max(1, total)) * 40)),
          100
        );
    },
  });

  options?.onProgress?.("serializing", 92, 100);
  const payload = JSON.stringify(snapshot);
  const checksum = computeChecksum(payload);

  let filePath: string;
  let writtenFormat: string;
  let size: number;
  let encrypted = false;

  if (encryptionPassword) {
    options?.onProgress?.("encrypting", 95, 100);
    const fileContent = encryptBackup(payload, encryptionPassword);
    filePath = path.join(dir, `${baseName}.json.enc`);
    await writeFile(filePath, fileContent);
    writtenFormat = "json.enc";
    size = fileContent.length;
    encrypted = true;
  } else {
    options?.onProgress?.("writing", 96, 100);
    const written = await writeBackupArchive(dir, baseName, payload, format);
    filePath = written.filePath;
    writtenFormat = written.format;
    const { stat } = await import("fs/promises");
    size = (await stat(filePath)).size;
  }

  await writeFile(`${filePath}.sha256`, checksum, "utf8");
  options?.onProgress?.("done", 100, 100);

  return {
    skipped: false,
    path: filePath,
    checksum,
    encrypted,
    size,
    format: writtenFormat,
  };
}

export async function runPanelBackup() {
  const backup = await getSettingGroup("backup");
  if (!backup.enabled) return { skipped: true as const, reason: "disabled" };

  const result = await writePanelBackupFile({
    includePasswords: backup.includePasswords === true,
    fullExport: backup.fullExportOnBackup !== false,
  });
  return result;
}
