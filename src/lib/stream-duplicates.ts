import { StreamType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DuplicateKind = "movies" | "series" | "live";
export type DuplicateReason = "url" | "title" | "episode";

export type DuplicateScanRow = {
  id: string;
  name: string;
  streamUrl: string;
  type: string;
  seriesName: string | null;
  seasonNum: number | null;
  episodeNum: number | null;
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
  bouquetCount: number;
  createdAt: Date;
};

export type DuplicateMember = {
  id: string;
  name: string;
  streamUrl: string;
  type: string;
  seriesName: string | null;
  seasonNum: number | null;
  episodeNum: number | null;
  isActive: boolean;
  categoryName: string | null;
  bouquetCount: number;
  createdAt: string;
  keepSuggested: boolean;
};

export type DuplicateGroup = {
  key: string;
  reason: DuplicateReason;
  label: string;
  keepId: string;
  members: DuplicateMember[];
};

/** Lowercase URL without credentials or trailing slash -- same file, different auth still matches. */
export function normalizeDuplicateUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    u.hash = "";
    const host = u.hostname.toLowerCase();
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, "");
    return `${u.protocol.toLowerCase()}//${host}${path}${u.search}`.toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

/** Strip quality tags so "Movie (1080p)" and "Movie [720p]" group together. */
export function normalizeDuplicateTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[.*?\]/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(
      /\b(s\d{1,2}e\d{1,3}|\d{3,4}p|4k|uhd|hdr10\+?|hdr|dv|bluray|blu-?ray|web-?dl|webrip|hdtv|x264|x265|h\.?264|h\.?265|hevc|avc|aac|ac3|dts|multi|proper|repack)\b/g,
      " "
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function episodeGroupKey(row: {
  seriesName: string | null;
  name: string;
  seasonNum: number | null;
  episodeNum: number | null;
}): string | null {
  const season = row.seasonNum;
  const ep = row.episodeNum;
  if (season == null || ep == null || season <= 0 || ep <= 0) return null;
  const series = normalizeDuplicateTitle(row.seriesName || row.name);
  if (!series) return null;
  return `${series}|s${season}|e${ep}`;
}

export function pickKeepId(rows: DuplicateScanRow[]): string {
  const ranked = [...rows].sort((a, b) => {
    if (b.bouquetCount !== a.bouquetCount) return b.bouquetCount - a.bouquetCount;
    const ac = a.categoryId ? 1 : 0;
    const bc = b.categoryId ? 1 : 0;
    if (bc !== ac) return bc - ac;
    if (Number(b.isActive) !== Number(a.isActive)) return Number(b.isActive) - Number(a.isActive);
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return ranked[0]?.id ?? rows[0]!.id;
}

function toMember(row: DuplicateScanRow, keepId: string): DuplicateMember {
  return {
    id: row.id,
    name: row.name,
    streamUrl: row.streamUrl,
    type: row.type,
    seriesName: row.seriesName,
    seasonNum: row.seasonNum,
    episodeNum: row.episodeNum,
    isActive: row.isActive,
    categoryName: row.categoryName,
    bouquetCount: row.bouquetCount,
    createdAt: row.createdAt.toISOString(),
    keepSuggested: row.id === keepId,
  };
}

function pushGroups(
  groups: DuplicateGroup[],
  used: Set<string>,
  buckets: Map<string, DuplicateScanRow[]>,
  reason: DuplicateReason,
  labelFor: (members: DuplicateScanRow[], key: string) => string
) {
  for (const [key, members] of buckets) {
    const fresh = members.filter((m) => !used.has(m.id));
    if (fresh.length < 2) continue;
    const keepId = pickKeepId(fresh);
    for (const m of fresh) used.add(m.id);
    groups.push({
      key: `${reason}:${key}`,
      reason,
      label: labelFor(fresh, key),
      keepId,
      members: fresh.map((m) => toMember(m, keepId)),
    });
  }
}

export function buildDuplicateGroups(rows: DuplicateScanRow[], kind: DuplicateKind): DuplicateGroup[] {
  const used = new Set<string>();
  const groups: DuplicateGroup[] = [];

  const byUrl = new Map<string, DuplicateScanRow[]>();
  for (const row of rows) {
    const key = normalizeDuplicateUrl(row.streamUrl);
    if (!key) continue;
    const list = byUrl.get(key) ?? [];
    list.push(row);
    byUrl.set(key, list);
  }
  pushGroups(groups, used, byUrl, "url", (members) => members[0]!.streamUrl);

  if (kind === "movies") {
    const byTitle = new Map<string, DuplicateScanRow[]>();
    for (const row of rows) {
      if (used.has(row.id)) continue;
      const key = normalizeDuplicateTitle(row.name);
      if (!key) continue;
      const list = byTitle.get(key) ?? [];
      list.push(row);
      byTitle.set(key, list);
    }
    pushGroups(groups, used, byTitle, "title", (members) => members[0]!.name);
  } else if (kind === "live") {
    const byTitle = new Map<string, DuplicateScanRow[]>();
    for (const row of rows) {
      if (used.has(row.id)) continue;
      const key = normalizeDuplicateTitle(row.name);
      if (!key) continue;
      const list = byTitle.get(key) ?? [];
      list.push(row);
      byTitle.set(key, list);
    }
    pushGroups(groups, used, byTitle, "title", (members) => members[0]!.name);
  } else {
    const byEpisode = new Map<string, DuplicateScanRow[]>();
    const parents: DuplicateScanRow[] = [];
    for (const row of rows) {
      if (used.has(row.id)) continue;
      const key = episodeGroupKey(row);
      if (key) {
        const list = byEpisode.get(key) ?? [];
        list.push(row);
        byEpisode.set(key, list);
      } else {
        parents.push(row);
      }
    }
    pushGroups(groups, used, byEpisode, "episode", (members) => {
      const m = members[0]!;
      const series = m.seriesName || m.name;
      const s = String(m.seasonNum ?? 0).padStart(2, "0");
      const e = String(m.episodeNum ?? 0).padStart(2, "0");
      return `${series} S${s}E${e}`;
    });

    const bySeries = new Map<string, DuplicateScanRow[]>();
    for (const row of parents) {
      if (used.has(row.id)) continue;
      const key = normalizeDuplicateTitle(row.seriesName || row.name);
      if (!key) continue;
      const list = bySeries.get(key) ?? [];
      list.push(row);
      bySeries.set(key, list);
    }
    pushGroups(groups, used, bySeries, "title", (members) => members[0]!.seriesName || members[0]!.name);
  }

  groups.sort((a, b) => b.members.length - a.members.length || a.label.localeCompare(b.label));
  return groups;
}

export type DuplicateScanOptions = {
  /** url = same streamUrl only; all = url then title/episode heuristics */
  match?: "url" | "all";
  categoryId?: string;
  /** e.g. `UK |%` or `US |%` */
  categoryNameLike?: string;
  limit?: number;
  offset?: number;
};

function streamTypeForKind(kind: DuplicateKind): StreamType {
  return kind === "movies" ? StreamType.MOVIE : kind === "live" ? StreamType.LIVE : StreamType.SERIES;
}

async function countStreamsForDuplicateScan(
  kind: DuplicateKind,
  opts?: DuplicateScanOptions
): Promise<number> {
  const type = streamTypeForKind(kind);
  const categoryId = opts?.categoryId?.trim();
  const categoryNameLike = opts?.categoryNameLike?.trim();
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "Stream" s
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    WHERE s.type = ${type}::"StreamType"
      ${kind === "live" ? Prisma.sql`AND s."isRadio" = false` : Prisma.empty}
      AND s."streamUrl" IS NOT NULL AND length(trim(s."streamUrl")) > 0
      ${categoryId ? Prisma.sql`AND s."categoryId" = ${categoryId}` : Prisma.empty}
      ${
        categoryNameLike
          ? Prisma.sql`AND c.name ILIKE ${categoryNameLike}`
          : Prisma.empty
      }
  `;
  return Number(rows[0]?.count ?? 0);
}

/** SQL grouping key -- close to normalizeDuplicateUrl (host + path, no trailing slash). */
function urlGroupKeySql() {
  return Prisma.sql`lower(regexp_replace(split_part(s."streamUrl", '?', 1), '/+$', ''))`;
}

async function findUrlDuplicateGroupsPaged(
  kind: DuplicateKind,
  opts: DuplicateScanOptions
): Promise<{
  groups: DuplicateGroup[];
  scanned: number;
  extraCopies: number;
  totalGroups: number;
}> {
  const type = streamTypeForKind(kind);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const categoryId = opts.categoryId?.trim();
  const categoryNameLike = opts.categoryNameLike?.trim();

  const scanned = await countStreamsForDuplicateScan(kind, opts);

  const dupKeys = await prisma.$queryRaw<{ url_key: string; cnt: number }[]>`
    SELECT ${urlGroupKeySql()} AS url_key, count(*)::int AS cnt
    FROM "Stream" s
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    WHERE s.type = ${type}::"StreamType"
      ${kind === "live" ? Prisma.sql`AND s."isRadio" = false` : Prisma.empty}
      AND s."streamUrl" IS NOT NULL AND length(trim(s."streamUrl")) > 0
      ${categoryId ? Prisma.sql`AND s."categoryId" = ${categoryId}` : Prisma.empty}
      ${
        categoryNameLike
          ? Prisma.sql`AND c.name ILIKE ${categoryNameLike}`
          : Prisma.empty
      }
    GROUP BY url_key
    HAVING count(*) > 1
    ORDER BY cnt DESC, url_key ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const totalRow = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT ${urlGroupKeySql()} AS url_key
      FROM "Stream" s
      LEFT JOIN "Category" c ON c.id = s."categoryId"
      WHERE s.type = ${type}::"StreamType"
        ${kind === "live" ? Prisma.sql`AND s."isRadio" = false` : Prisma.empty}
        AND s."streamUrl" IS NOT NULL AND length(trim(s."streamUrl")) > 0
        ${categoryId ? Prisma.sql`AND s."categoryId" = ${categoryId}` : Prisma.empty}
        ${
          categoryNameLike
            ? Prisma.sql`AND c.name ILIKE ${categoryNameLike}`
            : Prisma.empty
        }
      GROUP BY url_key
      HAVING count(*) > 1
    ) dup
  `;
  const totalGroups = Number(totalRow[0]?.count ?? 0);

  if (!dupKeys.length) {
    return { groups: [], scanned, extraCopies: 0, totalGroups };
  }

  const keys = dupKeys.map((r) => r.url_key);
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      streamUrl: string;
      type: string;
      seriesName: string | null;
      seasonNum: number | null;
      episodeNum: number | null;
      isActive: boolean;
      categoryId: string | null;
      categoryName: string | null;
      bouquetCount: bigint;
      createdAt: Date;
      url_key: string;
    }[]
  >`
    SELECT
      s.id,
      s.name,
      s."streamUrl" AS "streamUrl",
      s.type::text AS type,
      s."seriesName" AS "seriesName",
      s."seasonNum" AS "seasonNum",
      s."episodeNum" AS "episodeNum",
      s."isActive" AS "isActive",
      s."categoryId" AS "categoryId",
      c.name AS "categoryName",
      (SELECT COUNT(*)::bigint FROM "BouquetStream" bs WHERE bs."streamId" = s.id) AS "bouquetCount",
      s."createdAt" AS "createdAt",
      ${urlGroupKeySql()} AS url_key
    FROM "Stream" s
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    WHERE s.type = ${type}::"StreamType"
      ${kind === "live" ? Prisma.sql`AND s."isRadio" = false` : Prisma.empty}
      AND ${urlGroupKeySql()} IN (${Prisma.join(keys)})
      ${categoryId ? Prisma.sql`AND s."categoryId" = ${categoryId}` : Prisma.empty}
      ${
        categoryNameLike
          ? Prisma.sql`AND c.name ILIKE ${categoryNameLike}`
          : Prisma.empty
      }
  `;

  const mapped: DuplicateScanRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    streamUrl: r.streamUrl,
    type: r.type,
    seriesName: r.seriesName,
    seasonNum: r.seasonNum,
    episodeNum: r.episodeNum,
    isActive: r.isActive,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    bouquetCount: Number(r.bouquetCount),
    createdAt: r.createdAt,
  }));

  const byKey = new Map<string, DuplicateScanRow[]>();
  for (const row of mapped) {
    const key = normalizeDuplicateUrl(row.streamUrl) || row.streamUrl.toLowerCase();
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const { url_key, cnt } of dupKeys) {
    const members =
      byKey.get(url_key) ??
      [...byKey.entries()].find(([k]) => k.includes(url_key) || url_key.includes(k))?.[1] ??
      [];
    if (members.length < 2) continue;
    const keepId = pickKeepId(members);
    groups.push({
      key: `url:${url_key}`,
      reason: "url",
      label: members[0]!.streamUrl,
      keepId,
      members: members.map((m) => toMember(m, keepId)),
    });
    if (groups.length >= limit) break;
    void cnt;
  }

  const extraCopies = groups.reduce((n, g) => n + Math.max(0, g.members.length - 1), 0);
  return { groups, scanned, extraCopies, totalGroups };
}

/** Delete duplicate URL copies in UK / USA live categories (keeps best row per URL). */
export async function purgeUkUsaUrlDuplicateLive(): Promise<{ deleted: number; groups: number }> {
  let deleted = 0;
  let groups = 0;
  const patterns = ["UK |%", "US |%", "USA |%", "UK|%", "US|%", "USA|%"];
  const pageSize = 50;

  for (const pattern of patterns) {
    let offset = 0;
    for (let page = 0; page < 40; page++) {
      const { groups: batch, totalGroups } = await findUrlDuplicateGroupsPaged("live", {
        match: "url",
        categoryNameLike: pattern,
        limit: pageSize,
        offset,
      });
      if (!batch.length) break;

      const ids: string[] = [];
      for (const g of batch) {
        groups++;
        for (const m of g.members) {
          if (m.id !== g.keepId) ids.push(m.id);
        }
      }
      if (ids.length) {
        const r = await deleteDuplicateStreams(ids);
        deleted += r.deleted;
      }

      offset += pageSize;
      if (offset >= totalGroups) break;
    }
  }
  return { deleted, groups };
}
export async function findDuplicateGroups(
  kind: DuplicateKind,
  opts?: DuplicateScanOptions
): Promise<{
  groups: DuplicateGroup[];
  scanned: number;
  extraCopies: number;
  totalGroups?: number;
}> {
  const match = opts?.match ?? (kind === "live" ? "url" : "all");
  if (match === "url") {
    return findUrlDuplicateGroupsPaged(kind, opts ?? {});
  }

  const type = streamTypeForKind(kind);
  const categoryId = opts?.categoryId?.trim();
  const categoryNameLike = opts?.categoryNameLike?.trim();
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  const offset = Math.max(0, opts?.offset ?? 0);

  const rows = await prisma.stream.findMany({
    where: {
      type,
      ...(kind === "live" ? { isRadio: false } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(categoryNameLike
        ? { category: { name: { contains: categoryNameLike.replace(/%/g, ""), mode: "insensitive" } } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      streamUrl: true,
      type: true,
      seriesName: true,
      seasonNum: true,
      episodeNum: true,
      isActive: true,
      categoryId: true,
      createdAt: true,
      category: { select: { name: true } },
      _count: { select: { bouquets: true } },
    },
  });

  const mapped: DuplicateScanRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    streamUrl: r.streamUrl,
    type: r.type,
    seriesName: r.seriesName,
    seasonNum: r.seasonNum,
    episodeNum: r.episodeNum,
    isActive: r.isActive,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    bouquetCount: r._count.bouquets,
    createdAt: r.createdAt,
  }));

  const allGroups = buildDuplicateGroups(mapped, kind);
  const totalGroups = allGroups.length;
  const groups = allGroups.slice(offset, offset + limit);
  const extraCopies = allGroups.reduce((n, g) => n + Math.max(0, g.members.length - 1), 0);
  return { groups, scanned: mapped.length, extraCopies, totalGroups };
}

export async function deleteDuplicateStreams(ids: string[]): Promise<{ deleted: number; skipped: number }> {
  const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  if (!unique.length) return { deleted: 0, skipped: 0 };

  const allowed = await prisma.stream.findMany({
    where: { id: { in: unique }, type: { in: [StreamType.MOVIE, StreamType.SERIES, StreamType.LIVE] } },
    select: { id: true },
  });
  const okIds = allowed.map((s) => s.id);
  let deleted = 0;
  const chunkSize = 200;
  for (let i = 0; i < okIds.length; i += chunkSize) {
    const chunk = okIds.slice(i, i + chunkSize);
    const result = await prisma.stream.deleteMany({ where: { id: { in: chunk } } });
    deleted += result.count;
  }
  return { deleted, skipped: unique.length - okIds.length };
}

export type DuplicateNameCollision = {
  nameKey: string;
  displayName: string;
  streamCount: number;
  sharedCategories: string[];
  sharedBouquets: string[];
  streamIds: string[];
};

/**
 * Live channels with the same display name that overlap in a category or bouquet.
 * Causes wrong stream_id / probe vs playback mismatches (e.g. duplicate "24-7 ..." rows).
 */
export async function findDuplicateNameCollisions(
  type: StreamType = StreamType.LIVE
): Promise<{ collisions: DuplicateNameCollision[]; collisionCount: number; extraCopies: number }> {
  const rows = await prisma.stream.findMany({
    where: { type, ...(type === StreamType.LIVE ? { isRadio: false } : {}) },
    select: {
      id: true,
      name: true,
      category: { select: { name: true } },
      bouquets: { select: { bouquet: { select: { name: true } } } },
    },
  });

  const byName = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = normalizeDuplicateTitle(row.name);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(row);
    byName.set(key, list);
  }

  const collisions: DuplicateNameCollision[] = [];

  for (const [nameKey, members] of byName) {
    if (members.length < 2) continue;

    const categoryHits = new Map<string, number>();
    for (const m of members) {
      const cat = m.category?.name?.trim();
      if (!cat) continue;
      categoryHits.set(cat, (categoryHits.get(cat) ?? 0) + 1);
    }
    const sharedCategories = [...categoryHits.entries()]
      .filter(([, n]) => n >= 2)
      .map(([name]) => name);

    const bouquetHits = new Map<string, number>();
    for (const m of members) {
      for (const link of m.bouquets) {
        const b = link.bouquet?.name?.trim();
        if (!b) continue;
        bouquetHits.set(b, (bouquetHits.get(b) ?? 0) + 1);
      }
    }
    const sharedBouquets = [...bouquetHits.entries()]
      .filter(([, n]) => n >= 2)
      .map(([name]) => name);

    if (!sharedCategories.length && !sharedBouquets.length) continue;

    collisions.push({
      nameKey,
      displayName: members[0]!.name,
      streamCount: members.length,
      sharedCategories,
      sharedBouquets,
      streamIds: members.map((m) => m.id),
    });
  }

  collisions.sort(
    (a, b) =>
      b.streamCount - a.streamCount || a.displayName.localeCompare(b.displayName)
  );

  const extraCopies = collisions.reduce((n, c) => n + Math.max(0, c.streamCount - 1), 0);
  return { collisions, collisionCount: collisions.length, extraCopies };
}
