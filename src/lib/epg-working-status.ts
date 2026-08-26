import { prisma } from "@/lib/prisma";

function normalizeEpgId(id: string | null | undefined): string {
  return String(id ?? "").trim();
}

/** EPG channel IDs that have at least one current/future programme in the guide. */
export async function epgWorkingChannelIds(channelIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(channelIds.map((id) => normalizeEpgId(id)).filter(Boolean))];
  if (!ids.length) return new Set();

  const now = new Date();
  const rows = await prisma.epgProgram.findMany({
    where: {
      stop: { gte: now },
      OR: ids.map((id) => ({ channelId: { equals: id, mode: "insensitive" as const } })),
    },
    select: { channelId: true },
    distinct: ["channelId"],
  });
  return new Set(rows.map((r) => r.channelId.trim().toLowerCase()).filter(Boolean));
}

export function streamEpgWorking(
  epgChannelId: string | null | undefined,
  workingIds: Set<string>
): boolean {
  const id = normalizeEpgId(epgChannelId);
  if (!id) return false;
  return workingIds.has(id.toLowerCase());
}

export async function attachStreamEpgWorking<
  T extends { epgChannelId?: string | null; channelId?: string | null },
>(streams: T[]): Promise<(T & { epgWorking: boolean })[]> {
  const ids = streams.flatMap((s) => [s.epgChannelId, s.channelId].filter(Boolean) as string[]);
  const working = await epgWorkingChannelIds(ids);
  return streams.map((s) => ({
    ...s,
    epgWorking: streamEpgWorking(s.epgChannelId, working) || streamEpgWorking(s.channelId, working),
  }));
}
