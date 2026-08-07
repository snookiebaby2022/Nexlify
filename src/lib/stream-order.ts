import { prisma } from "./prisma";

/** Highest stream.sortOrder in the panel (or -1 when empty). */
export async function maxStreamSortOrder(): Promise<number> {
  const agg = await prisma.stream.aggregate({ _max: { sortOrder: true } });
  return agg._max.sortOrder ?? -1;
}

/** Next sortOrder when appending streams (e.g. manual create). */
export async function nextStreamSortOrder(): Promise<number> {
  return (await maxStreamSortOrder()) + 1;
}
