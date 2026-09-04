import { prisma } from "./prisma";
import { StreamType, VodMode } from "@prisma/client";
import type { M3uEntry } from "./m3u-parser";
import { categoryFromGroupName } from "./vod-category";
import { encodeLiveStreamMeta } from "./stream-live-meta";
import { maxStreamSortOrder } from "./stream-order";
import { liveTitleExactKey, liveTitleQualityKey } from "./live-title-dedupe";
import { normalizeStreamMatchKey, streamUrlHosts } from "./stream-url-match";

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

type ExistingLive = {
  id: string;
  streamUrl: string;
  name: string;
  streamIcon: string | null;
  epgChannelId: string | null;
  categoryId: string | null;
};

/**
 * Load LIVE streams that could match this playlist: exact URLs first, then
 * same-host rows keyed by normalized URL (port / /live/ path variants).
 */
async function loadExistingLiveForPlaylist(
  urls: string[]
): Promise<{
  byExact: Map<string, ExistingLive>;
  byNorm: Map<string, ExistingLive>;
}> {
  const byExact = new Map<string, ExistingLive>();
  const byNorm = new Map<string, ExistingLive>();

  const remember = (row: ExistingLive, preferExactUrl?: string) => {
    byExact.set(row.streamUrl, row);
    const key = normalizeStreamMatchKey(row.streamUrl);
    if (!key) return;
    const prev = byNorm.get(key);
    if (!prev) {
      byNorm.set(key, row);
      return;
    }
    // Prefer the row whose URL equals the playlist URL when both exist.
    if (preferExactUrl && row.streamUrl === preferExactUrl) {
      byNorm.set(key, row);
    }
  };

  for (let i = 0; i < urls.length; i += CHUNK) {
    const slice = urls.slice(i, i + CHUNK);
    const rows = await prisma.stream.findMany({
      where: { type: StreamType.LIVE, streamUrl: { in: slice } },
      select: {
        id: true,
        streamUrl: true,
        name: true,
        streamIcon: true,
        epgChannelId: true,
        categoryId: true,
      },
    });
    for (const row of rows) remember(row);
  }

  for (const host of streamUrlHosts(urls)) {
    const rows = await prisma.stream.findMany({
      where: {
        type: StreamType.LIVE,
        streamUrl: { contains: host, mode: "insensitive" },
      },
      select: {
        id: true,
        streamUrl: true,
        name: true,
        streamIcon: true,
        epgChannelId: true,
        categoryId: true,
      },
    });
    for (const row of rows) remember(row);
  }

  // Re-prefer exact playlist URLs in the norm map when both variants exist.
  for (const url of urls) {
    const exact = byExact.get(url);
    if (!exact) continue;
    const key = normalizeStreamMatchKey(url);
    if (key) byNorm.set(key, exact);
  }

  return { byExact, byNorm };
}

function resolveExisting(
  url: string,
  byExact: Map<string, ExistingLive>,
  byNorm: Map<string, ExistingLive>
): ExistingLive | undefined {
  return byExact.get(url) ?? byNorm.get(normalizeStreamMatchKey(url));
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
    /** Create/attach a bouquet named after each stream's group-title (default false — group-titles are categories, not packages). */
    autoBouquetFromGroup?: boolean;
    sortOrderStart?: number;
    reorderExisting?: boolean;
    /** When true (default), refresh name/logo/epg_id on existing LIVE URLs during sync. */
    updateNamesOnSync?: boolean;
    /** When true (default), move existing matches into the playlist group-title folder. */
    overwriteCategories?: boolean;
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
  let updated = 0;
  const errors: string[] = [];

  if (!filtered.length) {
    return {
      imported: 0,
      skipped: 0,
      updated: 0,
      errors: undefined as string[] | undefined,
    };
  }

  // Dedupe by URL (last wins) so createMany doesn't insert duplicates in one run.
  const byUrl = new Map<string, { entry: M3uEntry; index: number }>();
  filtered.forEach((entry, index) => {
    byUrl.set(entry.url, { entry, index });
  });
  const unique = [...byUrl.values()];
  const qualityCounts = new Map<string, number>();
  for (const { entry } of unique) {
    const k = liveTitleQualityKey(liveStreamDisplayName(entry));
    if (!k) continue;
    qualityCounts.set(k, (qualityCounts.get(k) ?? 0) + 1);
  }
  for (const [label, n] of qualityCounts) {
    if (n >= 3) {
      errors.push(`Playlist has ${n} copies of “${label}” (title + quality). Keep one source per event.`);
    }
  }

  const sortOrderStart =
    opts.sortOrderStart ??
    (opts.reorderExisting === false ? (await maxStreamSortOrder()) + 1 : 0);

  const { byExact, byNorm } = await loadExistingLiveForPlaylist(
    unique.map((u) => u.entry.url)
  );

  const dead404 = await prisma.stream.findMany({
    where: {
      type: StreamType.LIVE,
      lastProbeOk: false,
      lastProbeError: { contains: "404" },
    },
    select: { streamUrl: true },
    take: 5000,
  });
  const dead404Urls = new Set(dead404.map((r) => r.streamUrl));

  const seenExactName = new Set<string>();

  const categoryCache = new Map<string, string>();
  const bouquetCache = new Map<string, string>();
  const autoCategory = opts.autoCategory !== false;
  const autoBouquet = opts.autoBouquetFromGroup === true;
  const fixedCategoryId = opts.categoryId ?? null;
  const onDemand = false;
  const liveAgentStartCmd = !onDemand
    ? encodeLiveStreamMeta({ redirectStream: false })
    : null;
  const baseBouquetIds = opts.bouquetIds ?? [];

  // Resolve categories + group bouquets for new streams only (unique groups).
  const groupsNeeded = new Set<string>();
  for (const { entry } of unique) {
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
    streamUrl: string | null;
    name: string | null;
    streamIcon: string | null;
    epgChannelId: string | null;
    categoryId: string | null;
  }[] = [];

  /** Playlist URL → already-known stream id (exact or normalized match). */
  const matchedExistingIds = new Map<string, string>();

  for (const { entry, index } of unique) {
    const sortOrder = sortOrderStart + index;
    const groupKey = entry.group?.trim() || null;
    const existing = resolveExisting(entry.url, byExact, byNorm);
    if (existing) {
      matchedExistingIds.set(entry.url, existing.id);
      const wantNames = opts.updateNamesOnSync !== false;
      const nextName = wantNames ? liveStreamDisplayName(entry) : null;
      const nextIcon = wantNames ? entry.logo?.trim() || null : null;
      const nextEpg = wantNames
        ? entry.tvgId || entry.tvgName || entry.channelId || null
        : null;
      const urlChanged = existing.streamUrl !== entry.url;
      const nameChanged = Boolean(nextName && nextName !== existing.name);
      const iconChanged = Boolean(
        nextIcon && nextIcon !== (existing.streamIcon ?? null)
      );
      const epgChanged = Boolean(
        nextEpg && nextEpg !== (existing.epgChannelId ?? null)
      );
      let nextCategoryId: string | null = null;
      if (opts.overwriteCategories !== false && autoCategory && !fixedCategoryId && groupKey) {
        nextCategoryId = categoryCache.get(groupKey.toLowerCase()) ?? null;
        if (!nextCategoryId) {
          nextCategoryId = await categoryFromGroupName(groupKey, StreamType.LIVE);
          categoryCache.set(groupKey.toLowerCase(), nextCategoryId);
        }
      }
      const categoryChanged = Boolean(nextCategoryId && nextCategoryId !== existing.categoryId);
      const metaChanged = nameChanged || iconChanged || epgChanged || categoryChanged;

      if (
        opts.reorderExisting !== false ||
        metaChanged ||
        urlChanged
      ) {
        existingUpdates.push({
          id: existing.id,
          sortOrder,
          streamUrl: urlChanged ? entry.url : null,
          name: nameChanged ? nextName : null,
          streamIcon: iconChanged ? nextIcon : null,
          epgChannelId: epgChanged ? nextEpg : null,
          categoryId: categoryChanged ? nextCategoryId : null,
        });
        reordered++;
      }
      if (metaChanged) updated++;
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

    if (dead404Urls.has(entry.url)) {
      skipped++;
      errors.push(`${liveStreamDisplayName(entry)}: skipped (origin 404)`);
      continue;
    }

    const displayName = liveStreamDisplayName(entry);
    const exactKey = liveTitleExactKey(displayName);
    if (exactKey && seenExactName.has(exactKey)) {
      skipped++;
      errors.push(`${displayName}: skipped duplicate title in this playlist`);
      continue;
    }
    if (exactKey) seenExactName.add(exactKey);

    toCreate.push({
      name: displayName,
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
  const afterCreate = await loadExistingLiveForPlaylist(
    unique.map((u) => u.entry.url)
  );

  const bouquetLinks: { bouquetId: string; streamId: string; sortOrder: number }[] = [];
  for (const { entry, index } of unique) {
    const streamId =
      matchedExistingIds.get(entry.url) ||
      resolveExisting(entry.url, afterCreate.byExact, afterCreate.byNorm)?.id;
    if (!streamId) continue;
    const isNew = !matchedExistingIds.has(entry.url);
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

  // Optional reorder + name/icon/epg/url refresh of existing streams (batched updates)
  if (existingUpdates.length) {
    for (let i = 0; i < existingUpdates.length; i += 50) {
      const slice = existingUpdates.slice(i, i + 50);
      await prisma.$transaction(
        slice.map((u) =>
          prisma.stream.update({
            where: { id: u.id },
            data: {
              sortOrder: u.sortOrder,
              ...(u.streamUrl ? { streamUrl: u.streamUrl } : {}),
              ...(u.name ? { name: u.name } : {}),
              ...(u.streamIcon ? { streamIcon: u.streamIcon } : {}),
              ...(u.epgChannelId ? { epgChannelId: u.epgChannelId } : {}),
              ...(u.categoryId ? { categoryId: u.categoryId } : {}),
            },
          })
        )
      );
    }
  }

  return {
    imported,
    skipped,
    reordered: reordered || undefined,
    updated,
    errors: errors.length ? errors : undefined,
  };
}
