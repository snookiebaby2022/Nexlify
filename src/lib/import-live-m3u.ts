import { prisma } from "./prisma";
import { StreamType, VodMode } from "@prisma/client";
import type { M3uEntry } from "./m3u-parser";
import { categoryFromGroupName } from "./vod-category";
import { encodeLiveStreamMeta } from "./stream-live-meta";
import { maxStreamSortOrder } from "./stream-order";

const CHUNK = 400;

export function liveStreamDisplayName(entry: M3uEntry): string {
  const tvg = entry.tvgName?.trim();
  if (tvg) return tvg.slice(0, 200);
  const name = entry.name?.trim();
  if (name) return name.slice(0, 200);
  return "Unknown";
}

async function findOrCreateBouquetCached(
  name: string,
  cache: Map<string, string>
): Promise<string> {
  const trimmed = name.trim().slice(0, 120) || "Uncategorized";
  const key = trimmed.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const existing = await prisma.bouquet.findFirst({ where: { name: trimmed } });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const created = await prisma.bouquet.create({
    data: { name: trimmed },
  });
  cache.set(key, created.id);
  return created.id;
}

async function chunkedFindExisting(urls: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < urls.length; i += CHUNK) {
    const slice = urls.slice(i, i + CHUNK);
    const rows = await prisma.stream.findMany({
      where: { type: StreamType.LIVE, streamUrl: { in: slice } },
      select: { id: true, streamUrl: true },
    });
    for (const row of rows) map.set(row.streamUrl, row.id);
  }
  return map;
}

/**
 * Fast LIVE M3U import: batch DB writes, cache categories/bouquets from group-title,
 * set name from tvg-name, icon from tvg-logo, EPG from tvg-id.
 */
export async function importLiveM3uEntriesFast(
  entries: M3uEntry[],
  opts: {
    categoryId?: string | null;
    serverId?: string | null;
    defaultOnDemand?: boolean;
    selectedUrls?: string[];
    autoCategory?: boolean;
    bouquetIds?: string[];
    /** Create/attach a bouquet named after each stream's group-title (default true). */
    autoBouquetFromGroup?: boolean;
    sortOrderStart?: number;
    reorderExisting?: boolean;
    /** When true (default), refresh name/logo/epg_id on existing LIVE URLs during sync. */
    updateNamesOnSync?: boolean;
  }
) {
  const selectedSet = opts.selectedUrls?.length ? new Set(opts.selectedUrls) : null;
  const filtered = entries.filter((e) => {
    if (!e.url) return false;
    if (selectedSet && !selectedSet.has(e.url)) return false;
    return true;
  });

  let imported = 0;
  let skipped = 0;
  let reordered = 0;
  const errors: string[] = [];

  if (!filtered.length) {
    return { imported: 0, skipped: 0, errors: undefined as string[] | undefined };
  }

  // Dedupe by URL (last wins) so createMany doesn't insert duplicates in one run.
  const byUrl = new Map<string, { entry: M3uEntry; index: number }>();
  filtered.forEach((entry, index) => {
    byUrl.set(entry.url, { entry, index });
  });
  const unique = [...byUrl.values()];

  const sortOrderStart =
    opts.sortOrderStart ??
    (opts.reorderExisting === false ? (await maxStreamSortOrder()) + 1 : 0);

  const existingByUrl = await chunkedFindExisting(unique.map((u) => u.entry.url));

  const categoryCache = new Map<string, string>();
  const bouquetCache = new Map<string, string>();
  const autoCategory = opts.autoCategory !== false;
  const autoBouquet = opts.autoBouquetFromGroup !== false;
  const fixedCategoryId = opts.categoryId ?? null;
  const onDemand = opts.defaultOnDemand === true;
  const liveAgentStartCmd = !onDemand
    ? encodeLiveStreamMeta({ redirectStream: false })
    : null;
  const baseBouquetIds = opts.bouquetIds ?? [];

  // Resolve categories + group bouquets for new streams only (unique groups).
  const groupsNeeded = new Set<string>();
  for (const { entry } of unique) {
    if (existingByUrl.has(entry.url)) continue;
    const g = entry.group?.trim();
    if (g) groupsNeeded.add(g);
  }
  if (autoCategory && !fixedCategoryId) {
    for (const g of groupsNeeded) {
      const id = await categoryFromGroupName(g, StreamType.LIVE);
      categoryCache.set(g.toLowerCase(), id);
    }
  }
  if (autoBouquet) {
    for (const g of groupsNeeded) {
      await findOrCreateBouquetCached(g, bouquetCache);
    }
  }

  const toCreate: {
    name: string;
    streamUrl: string;
    streamIcon: string | null;
    type: StreamType;
    sortOrder: number;
    categoryId: string | null;
    serverId: string | null;
    epgChannelId: string | null;
    agentStartCmd: string | null;
    isOnDemand: boolean;
    vodMode: VodMode;
    autoRestart: boolean;
    groupKey: string | null;
  }[] = [];

  const existingUpdates: {
    id: string;
    sortOrder: number;
    groupKey: string | null;
    name: string | null;
    streamIcon: string | null;
    epgChannelId: string | null;
  }[] = [];
  let renamed = 0;

  for (const { entry, index } of unique) {
    const sortOrder = sortOrderStart + index;
    const groupKey = entry.group?.trim() || null;
    const existingId = existingByUrl.get(entry.url);
    if (existingId) {
      if (opts.reorderExisting !== false || opts.updateNamesOnSync !== false) {
        const name = liveStreamDisplayName(entry);
        existingUpdates.push({
          id: existingId,
          sortOrder,
          groupKey,
          name: opts.updateNamesOnSync !== false ? name : null,
          streamIcon:
            opts.updateNamesOnSync !== false ? entry.logo?.trim() || null : null,
          epgChannelId:
            opts.updateNamesOnSync !== false
              ? entry.tvgId || entry.tvgName || entry.channelId || null
              : null,
        });
        reordered++;
      }
      skipped++;
      continue;
    }

    let categoryId = fixedCategoryId;
    if (!categoryId && autoCategory && groupKey) {
      categoryId = categoryCache.get(groupKey.toLowerCase()) ?? null;
      if (!categoryId) {
        categoryId = await categoryFromGroupName(groupKey, StreamType.LIVE);
        categoryCache.set(groupKey.toLowerCase(), categoryId);
      }
    }

    toCreate.push({
      name: liveStreamDisplayName(entry),
      streamUrl: entry.url,
      streamIcon: entry.logo?.trim() || null,
      type: StreamType.LIVE,
      sortOrder,
      categoryId,
      serverId: opts.serverId ?? null,
      epgChannelId: entry.tvgId || entry.tvgName || entry.channelId || null,
      agentStartCmd: liveAgentStartCmd,
      isOnDemand: onDemand,
      vodMode: onDemand ? VodMode.ON_DEMAND : VodMode.LIVE,
      autoRestart: onDemand,
      groupKey,
    });
  }

  // Batch create new streams
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const slice = toCreate.slice(i, i + CHUNK);
    try {
      await prisma.stream.createMany({
        data: slice.map(({ groupKey: _g, ...row }) => row),
      });
      imported += slice.length;
    } catch (e) {
      // Fallback: one-by-one for this chunk if batch fails (partial unique conflicts, etc.)
      for (const row of slice) {
        try {
          const { groupKey: _g, ...data } = row;
          await prisma.stream.create({ data });
          imported++;
        } catch (err) {
          errors.push(
            `${row.name}: ${err instanceof Error ? err.message : "failed"}`
          );
          skipped++;
        }
      }
    }
  }

  // Resolve IDs for bouquet links (new + existing)
  const createdByUrl = await chunkedFindExisting(unique.map((u) => u.entry.url));

  const bouquetLinks: { bouquetId: string; streamId: string; sortOrder: number }[] = [];
  for (const { entry, index } of unique) {
    const streamId = createdByUrl.get(entry.url);
    if (!streamId) continue;
    // Only attach bouquets for newly imported streams, or when reordering existing
    const isNew = !existingByUrl.has(entry.url);
    if (!isNew && opts.reorderExisting === false) continue;
    const sortOrder = sortOrderStart + index;
    const ids = new Set(baseBouquetIds);
    if (autoBouquet && entry.group?.trim()) {
      const bid =
        bouquetCache.get(entry.group.trim().toLowerCase()) ||
        (await findOrCreateBouquetCached(entry.group, bouquetCache));
      ids.add(bid);
    }
    for (const bouquetId of ids) {
      bouquetLinks.push({ bouquetId, streamId, sortOrder });
    }
  }

  for (let i = 0; i < bouquetLinks.length; i += CHUNK) {
    const slice = bouquetLinks.slice(i, i + CHUNK);
    try {
      await prisma.bouquetStream.createMany({
        data: slice,
        skipDuplicates: true,
      });
    } catch (e) {
      errors.push(
        `bouquet link batch: ${e instanceof Error ? e.message : "failed"}`
      );
    }
  }

  // Optional reorder + name/icon/epg refresh of existing streams (batched updates)
  if (existingUpdates.length) {
    for (let i = 0; i < existingUpdates.length; i += 50) {
      const slice = existingUpdates.slice(i, i + 50);
      await prisma.$transaction(
        slice.map((u) =>
          prisma.stream.update({
            where: { id: u.id },
            data: {
              sortOrder: u.sortOrder,
              ...(u.name ? { name: u.name } : {}),
              ...(u.streamIcon ? { streamIcon: u.streamIcon } : {}),
              ...(u.epgChannelId ? { epgChannelId: u.epgChannelId } : {}),
            },
          })
        )
      );
      renamed += slice.filter((u) => u.name).length;
    }
  }

  return {
    imported,
    skipped,
    reordered: reordered || undefined,
    updated: renamed || undefined,
    errors: errors.length ? errors : undefined,
  };
}
