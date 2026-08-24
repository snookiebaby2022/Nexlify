import { Prisma, StreamType } from "@prisma/client";
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

/** Movies and series catalogs list newest uploads first. Live keeps bouquet/channel order. */
export function listVodNewestFirst(types?: StreamType | StreamType[] | null): boolean {
  if (types == null) return false;
  const list = Array.isArray(types) ? types : [types];
  if (!list.length) return false;
  return list.every((t) => t === StreamType.MOVIE || t === StreamType.SERIES);
}

/** Admin Streams / Movies / Series pages default to newest uploaded first. */
export function streamListOrderBy(sort?: string | null): Prisma.StreamOrderByWithRelationInput[] {
  const s = String(sort ?? "").trim().toLowerCase();
  if (s === "order" || s === "name" || s === "sort") {
    return [{ sortOrder: "asc" }, { name: "asc" }];
  }
  return [{ createdAt: "desc" }, { id: "desc" }];
}
