import { mkdir, stat, unlink } from "fs/promises";
import { join, dirname } from "path";
import { spawn } from "child_process";
import { prisma } from "@/lib/prisma";
import { DvrRecordingStatus, Prisma } from "@prisma/client";
import { logActivity } from "@/lib/lines";

export type DvrSettings = {
  enabled: boolean;
  storageRoot: string;
  maxStorageGb: number;
  retentionHours: number;
  recordingFormat: "ts" | "mp4";
  autoCleanup: boolean;
};

const DEFAULT_SETTINGS: DvrSettings = {
  enabled: true,
  storageRoot: process.env.DVR_STORAGE_ROOT?.trim() || join(process.cwd(), "storage", "dvr"),
  maxStorageGb: 500,
  retentionHours: 72,
  recordingFormat: "ts",
  autoCleanup: true,
};

export function getDvrStorageRoot(): string {
  return process.env.DVR_STORAGE_ROOT?.trim() || DEFAULT_SETTINGS.storageRoot;
}

export async function getDvrSettings(): Promise<DvrSettings> {
  const row = await prisma.panelSetting.findUnique({ where: { key: "dvr_settings" } });
  if (!row?.value) return { ...DEFAULT_SETTINGS, storageRoot: getDvrStorageRoot() };
  try {
    const parsed = JSON.parse(row.value) as Partial<DvrSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed, storageRoot: getDvrStorageRoot() };
  } catch {
    return { ...DEFAULT_SETTINGS, storageRoot: getDvrStorageRoot() };
  }
}

export async function updateDvrSettings(patch: Partial<DvrSettings>): Promise<DvrSettings> {
  const current = await getDvrSettings();
  const next = { ...current, ...patch, storageRoot: getDvrStorageRoot() };
  await prisma.panelSetting.upsert({
    where: { key: "dvr_settings" },
    create: { key: "dvr_settings", value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

function recordingFilePath(streamId: string, id: string, format: string) {
  return join(getDvrStorageRoot(), streamId, `${id}.${format}`);
}

export async function listDvrRecordings(opts?: {
  streamId?: string;
  lineId?: string;
  status?: DvrRecordingStatus;
  take?: number;
}) {
  const where: Prisma.DvrRecordingWhereInput = {};
  if (opts?.streamId) where.streamId = opts.streamId;
  if (opts?.lineId) where.lineId = opts.lineId;
  if (opts?.status) where.status = opts.status;
  return prisma.dvrRecording.findMany({
    where,
    orderBy: { startTime: "desc" },
    take: opts?.take ?? 200,
    include: { stream: { select: { id: true, name: true } }, line: { select: { id: true, username: true } } },
  });
}

export async function getDvrRecording(id: string) {
  return prisma.dvrRecording.findUnique({
    where: { id },
    include: { stream: { select: { id: true, name: true } } },
  });
}

export async function createDvrSchedule(opts: {
  streamId: string;
  lineId?: string | null;
  title?: string;
  startAt: Date;
  durationMin?: number;
  repeatRule?: string;
}) {
  const stream = await prisma.stream.findUnique({ where: { id: opts.streamId } });
  if (!stream) throw new Error("Stream not found");
  return prisma.dvrSchedule.create({
    data: {
      streamId: opts.streamId,
      lineId: opts.lineId ?? null,
      title: opts.title ?? stream.name,
      startAt: opts.startAt,
      durationMin: opts.durationMin ?? 60,
      repeatRule: opts.repeatRule ?? "none",
    },
  });
}

export async function listDvrSchedules(activeOnly = true) {
  return prisma.dvrSchedule.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { startAt: "asc" },
    include: { stream: { select: { id: true, name: true } } },
  });
}

/** Start a server-side ffmpeg recording to disk. */
export async function startDvrRecording(opts: {
  streamId: string;
  lineId?: string | null;
  title?: string;
  durationSec?: number;
  scheduleId?: string | null;
  upstreamUrl: string;
}) {
  const settings = await getDvrSettings();
  if (!settings.enabled) throw new Error("DVR is disabled");

  const stream = await prisma.stream.findUnique({ where: { id: opts.streamId } });
  if (!stream) throw new Error("Stream not found");

  const durationSec = Math.max(60, Math.min(opts.durationSec ?? 3600, 24 * 3600));
  const id = `dvr_${Date.now().toString(36)}`;
  const filePath = recordingFilePath(opts.streamId, id, settings.recordingFormat);
  await ensureDir(dirname(filePath));

  const recording = await prisma.dvrRecording.create({
    data: {
      id,
      streamId: opts.streamId,
      lineId: opts.lineId ?? null,
      scheduleId: opts.scheduleId ?? null,
      title: opts.title ?? stream.name,
      channelName: stream.name,
      startTime: new Date(),
      filePath,
      format: settings.recordingFormat,
      status: DvrRecordingStatus.RECORDING,
    },
  });

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    opts.upstreamUrl,
    "-t",
    String(durationSec),
    "-c",
    "copy",
    "-f",
    settings.recordingFormat === "mp4" ? "mp4" : "mpegts",
    filePath,
  ];

  const child = spawn("ffmpeg", args, { detached: true, stdio: "ignore" });
  child.unref();

  await prisma.dvrRecording.update({
    where: { id: recording.id },
    data: { pid: child.pid ?? null },
  });

  child.on("exit", () => {
    void finalizeDvrRecording(recording.id).catch(() => {});
  });

  void logActivity("dvr_recording_started", {
    entity: "dvr",
    entityId: recording.id,
    meta: { streamId: opts.streamId, filePath },
  });

  return recording;
}

export async function finalizeDvrRecording(id: string) {
  const rec = await prisma.dvrRecording.findUnique({ where: { id } });
  if (!rec || rec.status !== DvrRecordingStatus.RECORDING) return rec;

  let fileSize = BigInt(0);
  try {
    const st = await stat(rec.filePath);
    fileSize = BigInt(st.size);
  } catch {
    await prisma.dvrRecording.update({
      where: { id },
      data: { status: DvrRecordingStatus.FAILED, error: "Recording file missing", endTime: new Date() },
    });
    return prisma.dvrRecording.findUnique({ where: { id } });
  }

  const endTime = new Date();
  const durationSec = Math.max(0, Math.round((endTime.getTime() - rec.startTime.getTime()) / 1000));

  return prisma.dvrRecording.update({
    where: { id },
    data: {
      status: fileSize > BigInt(0) ? DvrRecordingStatus.COMPLETED : DvrRecordingStatus.FAILED,
      endTime,
      durationSec,
      fileSize,
      error: fileSize > BigInt(0) ? null : "Empty recording",
    },
  });
}

export async function stopDvrRecording(id: string) {
  const rec = await prisma.dvrRecording.findUnique({ where: { id } });
  if (!rec) return null;
  if (rec.pid) {
    try {
      process.kill(rec.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
  return finalizeDvrRecording(id);
}

export async function deleteDvrRecording(id: string) {
  const rec = await prisma.dvrRecording.findUnique({ where: { id } });
  if (!rec) return false;
  try {
    await unlink(rec.filePath);
  } catch {
    /* ignore */
  }
  await prisma.dvrRecording.delete({ where: { id } });
  return true;
}

export async function getDvrStorageUsage() {
  const settings = await getDvrSettings();
  const rows = await prisma.dvrRecording.findMany({
    where: { status: { in: [DvrRecordingStatus.RECORDING, DvrRecordingStatus.COMPLETED] } },
    select: { fileSize: true },
  });
  const usedBytes = rows.reduce((sum, r) => sum + r.fileSize, BigInt(0));
  const usedGb = Number(usedBytes) / (1024 * 1024 * 1024);
  const limitGb = settings.maxStorageGb;
  return {
    usedGb: Math.round(usedGb * 100) / 100,
    limitGb,
    percentUsed: limitGb > 0 ? Math.round((usedGb / limitGb) * 100) : 0,
    recordingCount: rows.length,
  };
}

export async function cleanupExpiredDvrRecordings(): Promise<number> {
  const settings = await getDvrSettings();
  if (!settings.autoCleanup) return 0;
  const cutoff = new Date(Date.now() - settings.retentionHours * 3600 * 1000);
  const expired = await prisma.dvrRecording.findMany({
    where: {
      status: DvrRecordingStatus.COMPLETED,
      startTime: { lt: cutoff },
    },
    take: 500,
  });
  let cleaned = 0;
  for (const rec of expired) {
    await deleteDvrRecording(rec.id);
    cleaned++;
  }
  return cleaned;
}

export function dvrPlaybackUrl(
  panelOrigin: string,
  username: string,
  password: string,
  recordingId: string
) {
  return `${panelOrigin}/api/dvr/playback/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(recordingId)}`;
}
