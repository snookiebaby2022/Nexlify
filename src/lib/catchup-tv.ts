import {
  cleanupExpiredDvrRecordings,
  createDvrSchedule,
  deleteDvrRecording,
  dvrPlaybackUrl,
  getDvrRecording,
  getDvrSettings,
  getDvrStorageUsage,
  listDvrRecordings,
  listDvrSchedules,
  startDvrRecording,
  stopDvrRecording,
  updateDvrSettings,
} from "@/lib/dvr-service";
import { resolveStreamPlaybackUrl } from "@/lib/resolve-stream-url";
import { prisma } from "@/lib/prisma";
import { DvrRecordingStatus } from "@prisma/client";

/** Bridge legacy catchup API to disk-backed DVR recordings. */
export type CatchupSettings = {
  enabled: boolean;
  bufferHours: number;
  maxStorageGb: number;
  recordingFormat: "ts" | "mp4";
  autoCleanup: boolean;
  cleanupAfterHours: number;
};

export type CatchupRecording = {
  id: string;
  streamId: string;
  channelId: string;
  channelName: string;
  startTime: number;
  endTime: number | null;
  duration: number;
  filePath: string;
  fileSize: number;
  format: string;
  status: "recording" | "completed" | "failed" | "expired";
  error?: string;
  createdAt: Date;
};

export type CatchupProgram = {
  id: string;
  streamId: string;
  title: string;
  start: number;
  end: number;
  duration: number;
  recordingId: string | null;
  available: boolean;
};

function mapStatus(status: DvrRecordingStatus): CatchupRecording["status"] {
  switch (status) {
    case "RECORDING":
      return "recording";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "expired";
  }
}

function mapRecording(row: {
  id: string;
  streamId: string;
  channelName: string;
  startTime: Date;
  endTime: Date | null;
  durationSec: number;
  filePath: string;
  fileSize: bigint;
  format: string;
  status: DvrRecordingStatus;
  error: string | null;
  createdAt: Date;
  title: string;
}): CatchupRecording {
  return {
    id: row.id,
    streamId: row.streamId,
    channelId: row.streamId,
    channelName: row.channelName,
    startTime: row.startTime.getTime(),
    endTime: row.endTime?.getTime() ?? null,
    duration: row.durationSec * 1000,
    filePath: row.filePath,
    fileSize: Number(row.fileSize),
    format: row.format,
    status: mapStatus(row.status),
    error: row.error ?? undefined,
    createdAt: row.createdAt,
  };
}

export async function getCatchupSettings(): Promise<CatchupSettings> {
  const dvr = await getDvrSettings();
  return {
    enabled: dvr.enabled,
    bufferHours: Math.round(dvr.retentionHours / 1),
    maxStorageGb: dvr.maxStorageGb,
    recordingFormat: dvr.recordingFormat,
    autoCleanup: dvr.autoCleanup,
    cleanupAfterHours: dvr.retentionHours,
  };
}

export async function updateCatchupSettings(settings: Partial<CatchupSettings>): Promise<void> {
  await updateDvrSettings({
    enabled: settings.enabled,
    maxStorageGb: settings.maxStorageGb,
    recordingFormat: settings.recordingFormat,
    autoCleanup: settings.autoCleanup,
    retentionHours: settings.cleanupAfterHours ?? settings.bufferHours,
  });
}

export async function startRecording(
  streamId: string,
  channelId: string,
  channelName: string,
  upstreamUrl: string
): Promise<CatchupRecording | null> {
  const settings = await getCatchupSettings();
  if (!settings.enabled) return null;
  const rec = await startDvrRecording({
    streamId,
    title: channelName,
    durationSec: 3600,
    upstreamUrl,
  });
  return mapRecording(rec);
}

export async function stopRecording(recordingId: string): Promise<CatchupRecording | null> {
  const rec = await stopDvrRecording(recordingId);
  return rec ? mapRecording(rec) : null;
}

export async function getRecording(recordingId: string): Promise<CatchupRecording | null> {
  const rec = await getDvrRecording(recordingId);
  return rec ? mapRecording(rec) : null;
}

export async function getStreamRecordings(streamId: string): Promise<CatchupRecording[]> {
  const rows = await listDvrRecordings({ streamId });
  return rows.map(mapRecording);
}

export async function getAvailableCatchup(
  streamId: string,
  startTime: number,
  endTime: number
): Promise<CatchupProgram[]> {
  const settings = await getCatchupSettings();
  const cutoff = Date.now() - settings.bufferHours * 3600 * 1000;
  const rows = await listDvrRecordings({ streamId });
  return rows
    .filter(
      (r) =>
        r.status === DvrRecordingStatus.COMPLETED &&
        r.startTime.getTime() >= cutoff &&
        r.startTime.getTime() <= endTime &&
        (r.endTime?.getTime() ?? Date.now()) >= startTime
    )
    .map((r) => ({
      id: `catchup_${r.id}`,
      streamId: r.streamId,
      title: r.title,
      start: r.startTime.getTime(),
      end: r.endTime?.getTime() ?? Date.now(),
      duration: r.durationSec * 1000,
      recordingId: r.id,
      available: true,
    }));
}

export async function getCatchupStreamUrl(
  recordingId: string,
  panelOrigin: string,
  username: string,
  password: string
): Promise<string | null> {
  const rec = await getDvrRecording(recordingId);
  if (!rec || rec.status !== DvrRecordingStatus.COMPLETED) return null;
  return dvrPlaybackUrl(panelOrigin, username, password, recordingId);
}

export async function cleanupExpiredRecordings(): Promise<number> {
  return cleanupExpiredDvrRecordings();
}

export async function getStorageUsage() {
  const usage = await getDvrStorageUsage();
  return {
    usedGb: usage.usedGb,
    limitGb: usage.limitGb,
    percentUsed: usage.percentUsed,
  };
}

export async function scheduleRecording(opts: {
  streamId: string;
  lineId?: string;
  title?: string;
  startAt: Date;
  durationMin?: number;
}) {
  return createDvrSchedule(opts);
}

export async function listScheduledRecordings(activeOnly = true) {
  return listDvrSchedules(activeOnly);
}

export async function startScheduledRecording(scheduleId: string) {
  const schedule = (await listDvrSchedules(false)).find((s) => s.id === scheduleId);
  if (!schedule) return null;
  const stream = await prisma.stream.findUnique({
    where: { id: schedule.streamId },
    include: { provider: true, server: true },
  });
  if (!stream) return null;
  const upstream = resolveStreamPlaybackUrl(stream);
  return startDvrRecording({
    streamId: schedule.streamId,
    lineId: schedule.lineId,
    title: schedule.title ?? stream.name,
    durationSec: schedule.durationMin * 60,
    scheduleId: schedule.id,
    upstreamUrl: upstream,
  });
}

export async function removeRecording(recordingId: string) {
  return deleteDvrRecording(recordingId);
}
