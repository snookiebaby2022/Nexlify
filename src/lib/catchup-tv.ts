import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, cacheDel } from "@/lib/cache";
import { getRedis } from "@/lib/redis";
import { logActivity } from "@/lib/lines";

const CATCHUP_PREFIX = "catchup:";
const RECORDING_PREFIX = "recording:";

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

export async function getCatchupSettings(): Promise<CatchupSettings> {
  const cached = await cacheGet<CatchupSettings>(`${CATCHUP_PREFIX}settings`);
  if (cached) return cached;
  return {
    enabled: false,
    bufferHours: 24,
    maxStorageGb: 100,
    recordingFormat: "ts",
    autoCleanup: true,
    cleanupAfterHours: 48,
  };
}

export async function updateCatchupSettings(settings: Partial<CatchupSettings>): Promise<void> {
  const current = await getCatchupSettings();
  const updated = { ...current, ...settings };
  await cacheSet(`${CATCHUP_PREFIX}settings`, updated, 86400);
}

export async function startRecording(
  streamId: string,
  channelId: string,
  channelName: string,
  upstreamUrl: string
): Promise<CatchupRecording | null> {
  const settings = await getCatchupSettings();
  if (!settings.enabled) return null;

  const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filePath = `/recordings/${streamId}/${id}.${settings.recordingFormat}`;
  const recording: CatchupRecording = {
    id,
    streamId,
    channelId,
    channelName,
    startTime: Date.now(),
    endTime: null,
    duration: 0,
    filePath,
    fileSize: 0,
    format: settings.recordingFormat,
    status: "recording",
    createdAt: new Date(),
  };

  await cacheSet(`${RECORDING_PREFIX}${id}`, recording, 86400);
  const streamRecordings = await getStreamRecordings(streamId);
  streamRecordings.push(recording);
  await cacheSet(`${CATCHUP_PREFIX}stream:${streamId}`, streamRecordings, 86400);
  void logActivity("catchup_recording_started", { recordingId: id, streamId, channelName });
  return recording;
}

export async function stopRecording(recordingId: string): Promise<CatchupRecording | null> {
  const recording = await cacheGet<CatchupRecording>(`${RECORDING_PREFIX}${recordingId}`);
  if (!recording) return null;
  recording.endTime = Date.now();
  recording.duration = recording.endTime - recording.startTime;
  recording.status = "completed";
  await cacheSet(`${RECORDING_PREFIX}${recordingId}`, recording, 86400);
  return recording;
}

export async function getRecording(recordingId: string): Promise<CatchupRecording | null> {
  return cacheGet<CatchupRecording>(`${RECORDING_PREFIX}${recordingId}`);
}

export async function getStreamRecordings(streamId: string): Promise<CatchupRecording[]> {
  return (await cacheGet<CatchupRecording[]>(`${CATCHUP_PREFIX}stream:${streamId}`)) ?? [];
}

export async function getAvailableCatchup(
  streamId: string,
  startTime: number,
  endTime: number
): Promise<CatchupProgram[]> {
  const recordings = await getStreamRecordings(streamId);
  const settings = await getCatchupSettings();
  const cutoff = Date.now() - settings.bufferHours * 3600 * 1000;

  const available = recordings.filter(
    (r) =>
      r.status === "completed" &&
      r.startTime >= cutoff &&
      r.startTime <= endTime &&
      (r.endTime ?? Infinity) >= startTime
  );

  return available.map((r) => ({
    id: `catchup_${r.id}`,
    streamId: r.streamId,
    title: r.channelName,
    start: r.startTime,
    end: r.endTime ?? Date.now(),
    duration: r.duration,
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
  const recording = await getRecording(recordingId);
  if (!recording || recording.status !== "completed") return null;
  const token = Buffer.from(recording.filePath, "utf8").toString("base64url");
  return `${panelOrigin}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(recording.streamId)}/catchup?r=${encodeURIComponent(token)}`;
}

export async function cleanupExpiredRecordings(): Promise<number> {
  const settings = await getCatchupSettings();
  if (!settings.autoCleanup) return 0;
  const cutoff = Date.now() - settings.cleanupAfterHours * 3600 * 1000;
  const redis = getRedis();
  if (!redis) return 0;

  let cleaned = 0;
  const keys = await redis.keys(`nexlify:${RECORDING_PREFIX}*`);
  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const recording = JSON.parse(raw) as CatchupRecording;
      if (recording.startTime < cutoff && recording.status === "completed") {
        recording.status = "expired";
        await redis.setex(key, 3600, JSON.stringify(recording));
        cleaned++;
      }
    } catch {
      continue;
    }
  }
  return cleaned;
}

export async function getStorageUsage(): Promise<{ usedGb: number; limitGb: number; percentUsed: number }> {
  const settings = await getCatchupSettings();
  const redis = getRedis();
  if (!redis) return { usedGb: 0, limitGb: settings.maxStorageGb, percentUsed: 0 };

  let totalBytes = 0;
  const keys = await redis.keys(`nexlify:${RECORDING_PREFIX}*`);
  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const recording = JSON.parse(raw) as CatchupRecording;
      if (recording.status !== "expired") totalBytes += recording.fileSize;
    } catch {
      continue;
    }
  }
  const usedGb = totalBytes / (1024 * 1024 * 1024);
  return {
    usedGb: Math.round(usedGb * 100) / 100,
    limitGb: settings.maxStorageGb,
    percentUsed: Math.round((usedGb / settings.maxStorageGb) * 100),
  };
}
