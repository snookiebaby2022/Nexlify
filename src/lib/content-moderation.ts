import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const MODERATION_PREFIX = "moderation:";

export type ModerationFlag = {
  id: string;
  streamId: string;
  streamName: string;
  reason: string;
  severity: "low" | "medium" | "high";
  status: "pending" | "reviewed" | "approved" | "rejected";
  flaggedAt: number;
};

export async function flagStream(
  streamId: string,
  reason: string,
  severity: ModerationFlag["severity"] = "medium"
): Promise<ModerationFlag> {
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  const flag: ModerationFlag = {
    id: `flag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    streamId,
    streamName: stream?.name ?? "",
    reason,
    severity,
    status: "pending",
    flaggedAt: Date.now(),
  };

  const flags = await getModerationFlags();
  flags.push(flag);
  await cacheSet(`${MODERATION_PREFIX}all`, flags, 86400);
  return flag;
}

export async function getModerationFlags(): Promise<ModerationFlag[]> {
  return (await cacheGet<ModerationFlag[]>(`${MODERATION_PREFIX}all`)) ?? [];
}

export async function reviewFlag(flagId: string, status: ModerationFlag["status"]): Promise<boolean> {
  const flags = await getModerationFlags();
  const idx = flags.findIndex((f) => f.id === flagId);
  if (idx < 0) return false;
  flags[idx].status = status;
  await cacheSet(`${MODERATION_PREFIX}all`, flags, 86400);
  return true;
}
