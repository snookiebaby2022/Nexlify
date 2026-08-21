import { createDvrSchedule, listDvrSchedules } from "@/lib/dvr-service";

/** Disk-backed DVR scheduler (replaces cache-only recording scheduler). */
export type RecordingSchedule = {
  id: string;
  streamId: string;
  streamName: string;
  startTime: string;
  duration: number;
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
  const schedule = await createDvrSchedule({
    streamId,
    startAt: new Date(startTime),
    durationMin: duration,
    repeatRule: repeat,
  });
  return {
    id: schedule.id,
    streamId: schedule.streamId,
    streamName: schedule.title ?? "",
    startTime: schedule.startAt.toISOString(),
    duration: schedule.durationMin,
    repeat: (schedule.repeatRule as RecordingSchedule["repeat"]) || "none",
    isActive: schedule.isActive,
    storagePath: `/recordings/${streamId}/`,
  };
}

export async function getRecordingSchedules(): Promise<RecordingSchedule[]> {
  const rows = await listDvrSchedules(false);
  return rows.map((s) => ({
    id: s.id,
    streamId: s.streamId,
    streamName: s.stream?.name ?? s.title ?? "",
    startTime: s.startAt.toISOString(),
    duration: s.durationMin,
    repeat: (s.repeatRule as RecordingSchedule["repeat"]) || "none",
    isActive: s.isActive,
    storagePath: `/recordings/${s.streamId}/`,
  }));
}

export async function deleteRecordingSchedule(scheduleId: string): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  await prisma.dvrSchedule.delete({ where: { id: scheduleId } }).catch(() => null);
  return true;
}

export async function getRecordings(): Promise<Recording[]> {
  const { listDvrRecordings } = await import("@/lib/dvr-service");
  const rows = await listDvrRecordings();
  return rows.map((r) => ({
    id: r.id,
    scheduleId: r.scheduleId ?? "",
    streamId: r.streamId,
    streamName: r.channelName,
    startTime: r.startTime.toISOString(),
    endTime: r.endTime?.toISOString() ?? "",
    duration: r.durationSec,
    filePath: r.filePath,
    fileSize: Number(r.fileSize),
    status:
      r.status === "RECORDING"
        ? "recording"
        : r.status === "COMPLETED"
          ? "completed"
          : "failed",
  }));
}

export async function startRecording(scheduleId: string): Promise<Recording | null> {
  const { startScheduledRecording } = await import("@/lib/catchup-tv");
  const rec = await startScheduledRecording(scheduleId);
  if (!rec) return null;
  return {
    id: rec.id,
    scheduleId: rec.scheduleId ?? "",
    streamId: rec.streamId,
    streamName: rec.channelName,
    startTime: rec.startTime.toISOString(),
    endTime: "",
    duration: rec.durationSec,
    filePath: rec.filePath,
    fileSize: Number(rec.fileSize),
    status: "recording",
  };
}

export async function stopRecording(recordingId: string): Promise<boolean> {
  const { stopDvrRecording } = await import("@/lib/dvr-service");
  await stopDvrRecording(recordingId);
  return true;
}
