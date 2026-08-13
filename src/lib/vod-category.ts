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
