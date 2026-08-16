import { StreamType } from "@prisma/client";
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

/** Lowercase URL without credentials or trailing slash — same file, different auth still matches. */
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

export async function findDuplicateGroups(kind: DuplicateKind): Promise<{
  groups: DuplicateGroup[];
  scanned: number;
  extraCopies: number;
}> {
  const type =
    kind === "movies" ? StreamType.MOVIE : kind === "live" ? StreamType.LIVE : StreamType.SERIES;
  const rows = await prisma.stream.findMany({
    where: {
      type,
      ...(kind === "live" ? { isRadio: false } : {}),
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

  const groups = buildDuplicateGroups(mapped, kind);
  const extraCopies = groups.reduce((n, g) => n + Math.max(0, g.members.length - 1), 0);
  return { groups, scanned: mapped.length, extraCopies };
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
