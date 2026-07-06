import { prisma } from "@/lib/prisma";

export type ModerationFlag = {
  id: string;
  streamId: string;
  streamName: string;
  reason: string;
  severity: "low" | "medium" | "high";
  status: "pending" | "reviewed" | "approved" | "rejected";
  flaggedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
};

export async function flagStream(
  streamId: string,
  reason: string,
  severity: "low" | "medium" | "high" = "medium"
): Promise<ModerationFlag> {
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  return prisma.moderationFlag.create({
    data: {
      streamId,
      streamName: stream?.name ?? "",
      reason,
      severity,
    },
  }) as Promise<ModerationFlag>;
}

export async function getModerationFlags(status?: string): Promise<ModerationFlag[]> {
  return prisma.moderationFlag.findMany({
    where: status ? { status } : undefined,
    orderBy: { flaggedAt: "desc" },
    take: 500,
  }) as Promise<ModerationFlag[]>;
}

export async function reviewFlag(
  flagId: string,
  status: ModerationFlag["status"],
  reviewedBy?: string
): Promise<boolean> {
  const result = await prisma.moderationFlag.updateMany({
    where: { id: flagId },
    data: { status, reviewedAt: new Date(), reviewedBy: reviewedBy ?? null },
  });
  return result.count > 0;
}

export async function deleteFlag(flagId: string): Promise<boolean> {
  const result = await prisma.moderationFlag.deleteMany({ where: { id: flagId } });
  return result.count > 0;
}
