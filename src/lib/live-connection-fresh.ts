import { prisma } from "@/lib/prisma";

/** Compare naive `lastSeenAt` to UTC wall-clock so session TimeZone cannot hide live rows. */
export async function listUtcFreshLiveConnectionIds(staleMs: number, _limit = 8000): Promise<string[]> {
  const secs = Math.max(1, Math.round(staleMs / 1000));
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "LiveConnection"
    WHERE "lastSeenAt" >= (timezone('UTC', now()) - (${secs} * interval '1 second'))
    LIMIT 8000
  `;
  return rows.map((r) => r.id);
}
