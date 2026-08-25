import type { StreamType, CategoryType } from "@prisma/client";
import { prisma } from "./prisma";

function streamTypeToCategoryType(type: StreamType): CategoryType {
  if (type === "MOVIE") return "MOVIE";
  if (type === "SERIES") return "SERIES";
  return "LIVE";
}

async function findOrCreateCategory(
  name: string,
  parentId?: string | null,
  categoryType: CategoryType = "LIVE"
): Promise<string> {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) {
    return findOrCreateCategory("Uncategorized", parentId, categoryType);
  }
  const existing = await prisma.category.findFirst({
    where: { name: trimmed, parentId: parentId ?? null, categoryType },
  });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { name: trimmed, parentId: parentId ?? null, categoryType },
  }).catch(async (e) => {
    const again = await prisma.category.findFirst({
      where: { name: trimmed, parentId: parentId ?? null, categoryType },
    });
    if (again) return again;
    throw e;
  });
  return created.id;
}

/** Root "Movies" category, optionally a genre child (e.g. Movies → Action). */
export async function categoryForMovie(genreName?: string | null): Promise<string> {
  const rootId = await findOrCreateCategory("Movies", null, "MOVIE");
  const genre = genreName?.trim();
  if (genre && !/^movies?$/i.test(genre)) {
    return findOrCreateCategory(genre, rootId, "MOVIE");
  }
  return rootId;
}

/**
 * Flat movie categories for Plex / Xtream apps (Smarters, XCIPTV).
 * Nested Movies→Genre + broken parent_id trees make "All" empty and hide content.
 * Genre becomes a top-level MOVIE category; missing genre → "Movies".
 */
export async function categoryForPlexMovie(genreName?: string | null): Promise<string> {
  const genre = genreName?.trim();
  if (genre && !/^movies?$/i.test(genre)) {
    return findOrCreateCategory(genre, null, "MOVIE");
  }
  return findOrCreateCategory("Movies", null, "MOVIE");
}

/** Root "TV Series" → Genre (optional) → show name. */
export async function categoryForSeries(
  seriesName?: string | null,
  genreName?: string | null
): Promise<string> {
  const rootId = await findOrCreateCategory("TV Series", null, "SERIES");
  const genre = genreName?.trim();
  const show = seriesName?.trim();
  let parentId = rootId;
  if (genre && !/^tv\s*series?$/i.test(genre) && (!show || genre.toLowerCase() !== show.toLowerCase())) {
    parentId = await findOrCreateCategory(genre, rootId, "SERIES");
  }
  if (show) {
    return findOrCreateCategory(show, parentId, "SERIES");
  }
  return parentId;
}

/**
 * Flat series categories for Plex / Xtream apps.
 * Do not name a category "TV Series" — that duplicates the TV Series bouquet
 * in Smarters/XCIPTV. Genre only; missing genre → Other.
 */
export async function categoryForPlexSeries(genreName?: string | null): Promise<string> {
  const genre = genreName?.trim();
  if (genre && !/^tv\s*series?$/i.test(genre) && !/^other$/i.test(genre)) {
    return findOrCreateCategory(genre, null, "SERIES");
  }
  return findOrCreateCategory("Other", null, "SERIES");
}

/** Move streams out of the redundant "TV Series" category, then drop it if empty. */
export async function reassignTvSeriesNamedCategory(): Promise<{ moved: number; deleted: number }> {
  const catchAllId = await findOrCreateCategory("Other", null, "SERIES");
  const generic = await prisma.category.findMany({
    where: { categoryType: "SERIES", name: { equals: "TV Series", mode: "insensitive" } },
    select: { id: true },
  });
  if (!generic.length) {
    const deletedEmpty = await prisma.category.deleteMany({
      where: {
        categoryType: "SERIES",
        streams: { none: {} },
        children: { none: {} },
        parentId: { not: null },
      },
    });
    return { moved: 0, deleted: deletedEmpty.count };
  }

  const genericIds = generic.map((c) => c.id);
  const moved = await prisma.stream.updateMany({
    where: { type: "SERIES", categoryId: { in: genericIds } },
    data: { categoryId: catchAllId },
  });

  await prisma.category.deleteMany({
    where: {
      categoryType: "SERIES",
      streams: { none: {} },
      children: { none: {} },
      OR: [{ id: { in: genericIds } }, { parentId: { not: null } }],
    },
  });

  const leftover = await prisma.category.deleteMany({
    where: { id: { in: genericIds }, streams: { none: {} }, children: { none: {} } },
  });

  return { moved: moved.count, deleted: leftover.count };
}

/**
 * Smarters lists every SERIES category as a top-level folder (parent_id is always 0).
 * Nested per-show folders make category load crawl. Move episodes onto flat genre cats.
 */
export async function flattenNestedSeriesCategories(): Promise<{ moved: number; deleted: number }> {
  const nested = await prisma.category.findMany({
    where: { categoryType: "SERIES", parentId: { not: null } },
    select: { id: true, parentId: true, name: true },
  });
  if (!nested.length) return { moved: 0, deleted: 0 };

  const all = await prisma.category.findMany({
    where: { categoryType: "SERIES" },
    select: { id: true, parentId: true, name: true },
  });
  const byId = new Map(all.map((c) => [c.id, c]));
  const rootGenre = (startId: string): string => {
    let cur = byId.get(startId);
    let guard = 0;
    while (cur?.parentId && guard++ < 8) {
      cur = byId.get(cur.parentId);
    }
    const n = cur?.name?.trim() || "Other";
    if (/^tv\s*series$/i.test(n) || /^other$/i.test(n)) return "Other";
    return n;
  };

  const idsByTarget = new Map<string, string[]>();
  for (const cat of nested) {
    const targetId = await categoryForPlexSeries(rootGenre(cat.id));
    if (targetId === cat.id) continue;
    const list = idsByTarget.get(targetId) ?? [];
    list.push(cat.id);
    idsByTarget.set(targetId, list);
  }

  let moved = 0;
  for (const [targetId, fromIds] of idsByTarget) {
    for (let i = 0; i < fromIds.length; i += 200) {
      const chunk = fromIds.slice(i, i + 200);
      const res = await prisma.stream.updateMany({
        where: { type: "SERIES", categoryId: { in: chunk } },
        data: { categoryId: targetId },
      });
      moved += res.count;
    }
  }

  const deleted = await prisma.category.deleteMany({
    where: {
      categoryType: "SERIES",
      parentId: { not: null },
      streams: { none: {} },
      children: { none: {} },
    },
  });
  return { moved, deleted: deleted.count };
}

export async function categoryFromGroupName(
  group: string,
  type: StreamType
): Promise<string> {
  const g = group.trim();
  if (!g) {
    return type === "SERIES" ? categoryForSeries() : categoryForMovie();
  }
  if (type === "SERIES") {
    return categoryForSeries(g);
  }
  if (type === "MOVIE") {
    return categoryForMovie(g);
  }
  return findOrCreateCategory(g, null, streamTypeToCategoryType(type));
}

/** movies/Action/foo.mp4 → Movies → Action; series/Show/... → TV Series → Show */
export async function categoryFromFolderPath(
  filePath: string,
  root: string,
  type: StreamType,
  seriesName?: string | null
): Promise<string> {
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const full = filePath.replace(/\\/g, "/");
  const rel = full.toLowerCase().startsWith(normalizedRoot.toLowerCase())
    ? full.slice(normalizedRoot.length).replace(/^\/+/, "")
    : full;
  const parts = rel.split("/").filter(Boolean);
  const lowerParts = parts.map((p) => p.toLowerCase());

  if (type === "SERIES" || seriesName) {
    const showPart =
      seriesName ??
      parts.find((p, i) => i < parts.length - 1 && !/^season/i.test(p) && !/\.(mkv|mp4|avi|ts)$/i.test(p));
    const genrePart = parts.find(
      (p, i) =>
        i < (parts.findIndex((x) => x === showPart) >= 0 ? parts.findIndex((x) => x === showPart) : parts.length) &&
        !/^season/i.test(p) &&
        !/^series$/i.test(p) &&
        !/^tv\s*series$/i.test(p) &&
        p !== showPart
    );
    return categoryForSeries(showPart, genrePart);
  }

  const moviesIdx = lowerParts.findIndex((p) => p === "movies" || p === "movie" || p === "vod");
  if (moviesIdx >= 0 && parts[moviesIdx + 1] && !/\.(mkv|mp4|avi|ts)$/i.test(parts[moviesIdx + 1])) {
    return categoryForMovie(parts[moviesIdx + 1]);
  }
  if (parts.length >= 2 && !/\.(mkv|mp4|avi|ts)$/i.test(parts[0])) {
    // folder/Genre/file.mp4 → genre
    return categoryForMovie(parts[0]);
  }
  if (lowerParts[0] === "series" || lowerParts.includes("series")) {
    return categoryForSeries();
  }
  return categoryForMovie();
}
