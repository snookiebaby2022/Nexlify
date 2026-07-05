import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const SCHEDULE_PREFIX = "schedule:";

export type ChannelSchedule = {
  id: string;
  streamId: string;
  streamName: string;
  startTime: string;
  endTime: string;
  repeat: "none" | "daily" | "weekly";
  isActive: boolean;
};

export async function createChannelSchedule(
  streamId: string,
  startTime: string,
  endTime: string,
  repeat: ChannelSchedule["repeat"] = "none"
): Promise<ChannelSchedule> {
  const schedule: ChannelSchedule = {
    id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    streamId,
    streamName: "",
    startTime,
    endTime,
    repeat,
    isActive: true,
  };

  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (stream) schedule.streamName = stream.name;

  const schedules = await getChannelSchedules();
  schedules.push(schedule);
  await cacheSet(`${SCHEDULE_PREFIX}all`, schedules, 86400);
  return schedule;
}

export async function getChannelSchedules(): Promise<ChannelSchedule[]> {
  return (await cacheGet<ChannelSchedule[]>(`${SCHEDULE_PREFIX}all`)) ?? [];
}

export async function deleteChannelSchedule(scheduleId: string): Promise<boolean> {
  const schedules = await getChannelSchedules();
  const filtered = schedules.filter((s) => s.id !== scheduleId);
  await cacheSet(`${SCHEDULE_PREFIX}all`, filtered, 86400);
  return true;
}

export async function getActiveSchedules(): Promise<ChannelSchedule[]> {
  const schedules = await getChannelSchedules();
  const now = new Date();
  return schedules.filter((s) => {
    if (!s.isActive) return false;
    const start = new Date(s.startTime);
    const end = new Date(s.endTime);
    return now >= start && now <= end;
  });
}
