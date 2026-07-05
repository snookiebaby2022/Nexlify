import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const RECORDING_PREFIX = "recording:";

export type RecordingSchedule = {
  id: string;
  streamId: string;
  streamName: string;
  startTime: string;
  duration: number; // minutes
  repeat: "none" | "daily" | "weekly";
  isActive: boolean;
  storagePath: string;
};

export type Recording = {
  id: string;
  scheduleId: string;
  streamId: string;
  streamName: string;
  startTime: string;
  endTime: string;
  duration: number;
  filePath: string;
  fileSize: number;
  status: "recording" | "completed" | "failed";
};

export async function createRecordingSchedule(
  streamId: string,
  startTime: string,
  duration: number,
  repeat: RecordingSchedule["repeat"] = "none"
): Promise<RecordingSchedule> {
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  const schedule: RecordingSchedule = {
    id: `recsched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    streamId,
    streamName: stream?.name ?? "",
    startTime,
    duration,
    repeat,
    isActive: true,
    storagePath: `/recordings/${streamId}/`,
  };

  const schedules = await getRecordingSchedules();
  schedules.push(schedule);
  await cacheSet(`${RECORDING_PREFIX}schedules`, schedules, 86400);
  return schedule;
}

export async function getRecordingSchedules(): Promise<RecordingSchedule[]> {
  return (await cacheGet<RecordingSchedule[]>(`${RECORDING_PREFIX}schedules`)) ?? [];
}

export async function deleteRecordingSchedule(scheduleId: string): Promise<boolean> {
  const schedules = await getRecordingSchedules();
  const filtered = schedules.filter((s) => s.id !== scheduleId);
  await cacheSet(`${RECORDING_PREFIX}schedules`, filtered, 86400);
  return true;
}

export async function getRecordings(): Promise<Recording[]> {
  return (await cacheGet<Recording[]>(`${RECORDING_PREFIX}list`)) ?? [];
}

export async function startRecording(scheduleId: string): Promise<Recording | null> {
  const schedules = await getRecordingSchedules();
  const schedule = schedules.find((s) => s.id === scheduleId);
  if (!schedule) return null;

  const recording: Recording = {
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    scheduleId: schedule.id,
    streamId: schedule.streamId,
    streamName: schedule.streamName,
    startTime: new Date().toISOString(),
    endTime: "",
    duration: schedule.duration,
    filePath: `${schedule.storagePath}${Date.now()}.ts`,
    fileSize: 0,
    status: "recording",
  };

  const recordings = await getRecordings();
  recordings.push(recording);
  await cacheSet(`${RECORDING_PREFIX}list`, recordings, 86400);
  return recording;
}

export async function stopRecording(recordingId: string): Promise<boolean> {
  const recordings = await getRecordings();
  const idx = recordings.findIndex((r) => r.id === recordingId);
  if (idx < 0) return false;
  recordings[idx].status = "completed";
  recordings[idx].endTime = new Date().toISOString();
  await cacheSet(`${RECORDING_PREFIX}list`, recordings, 86400);
  return true;
}
