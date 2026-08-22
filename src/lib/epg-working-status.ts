import { prisma } from "@/lib/prisma";

/** EPG channel IDs that have at least one current/future programme in the guide. */
export async function epgWorkingChannelIds(channelIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(channelIds.map((id) => id?.trim()).filter(Boolean))];
  if (!ids.length) return new Set();

  const now = new Date();
  const rows = await prisma.epgProgram.findMany({
    where: { channelId: { in: ids }, stop: { gte: now } },
    select: { channelId: true },
    distinct: ["channelId"],
  });
  return new Set(rows.map((r) => r.channelId));
}

export function streamEpgWorking(
  epgChannelId: string | null | undefined,
  workingIds: Set<string>
): boolean {
  const id = epgChannelId?.trim();
  if (!id) return false;
  return workingIds.has(id);
}
