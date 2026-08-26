import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function normalizeEpgId(id: string | null | undefined): string {
  return String(id ?? "").trim();
}

let epgWorkingCache: { key: string; at: number; ids: Set<string> } | null = null;
const EPG_WORKING_CACHE_MS = 30_000;

/** EPG channel IDs that have at least one current/future programme in the guide. */
export async function epgWorkingChannelIds(channelIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(channelIds.map((id) => normalizeEpgId(id)).filter(Boolean))];
  if (!ids.length) return new Set();

  const cacheKey = ids.map((id) => id.toLowerCase()).sort().join("\n");
  const nowMs = Date.now();
  if (epgWorkingCache && epgWorkingCache.key === cacheKey && nowMs - epgWorkingCache.at < EPG_WORKING_CACHE_MS) {
    return epgWorkingCache.ids;
  }

  const lowerIds = ids.map((id) => id.toLowerCase());
  const rows = await prisma.$queryRaw<Array<{ channelId: string }>>(
    Prisma.sql`
      SELECT DISTINCT "channelId"
      FROM "EpgProgram"
      WHERE stop >= ${new Date()}
        AND (
          "channelId" IN (${Prisma.join(ids)})
          OR lower("channelId") IN (${Prisma.join(lowerIds)})
        )
    `
  );
  const set = new Set(rows.map((r) => r.channelId.trim().toLowerCase()).filter(Boolean));
  epgWorkingCache = { key: cacheKey, at: nowMs, ids: set };
  return set;
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
