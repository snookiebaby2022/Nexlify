import type { StreamType } from "@prisma/client";
import { prisma } from "./prisma";

async function findOrCreateCategory(name: string, parentId?: string | null): Promise<string> {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) {
    return findOrCreateCategory("Uncategorized", parentId);
  }
  const existing = await prisma.category.findFirst({
    where: { name: trimmed, parentId: parentId ?? null },
  });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { name: trimmed, parentId: parentId ?? null },
  });
  return created.id;
}

/** Root "Movies" category, optionally a genre child (e.g. Movies → Action). */
export async function categoryForMovie(genreName?: string | null): Promise<string> {
  const rootId = await findOrCreateCategory("Movies");
  const genre = genreName?.trim();
  if (genre && !/^movies?$/i.test(genre)) {
    return findOrCreateCategory(genre, rootId);
  }
  return rootId;
}

/** Root "TV Series" → show name (and optional genre as show-level category name). */
export async function categoryForSeries(
  seriesName?: string | null,
  genreName?: string | null
): Promise<string> {
  const rootId = await findOrCreateCategory("TV Series");
  const show = seriesName?.trim();
  if (show) {
    return findOrCreateCategory(show, rootId);
  }
  const genre = genreName?.trim();
  if (genre && !/^tv\s*series?$/i.test(genre)) {
    return findOrCreateCategory(genre, rootId);
  }
  return rootId;
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
  return findOrCreateCategory(g);
}

/** movies/foo.mp4 → Movies; series/Show/... → TV Series → Show */
export async function categoryFromFolderPath(
  filePath: string,
  root: string,
  type: StreamType,
  seriesName?: string | null
): Promise<string> {
  const rel = filePath.replace(/\\/g, "/").toLowerCase();
  const parts = rel.split("/").filter(Boolean);

  if (type === "SERIES" || seriesName) {
    return categoryForSeries(seriesName ?? parts.find((p) => !/^season/i.test(p)));
  }
  if (parts[0] === "movies" || parts.includes("movies")) {
    return categoryForMovie();
  }
  if (parts[0] === "series" || parts.includes("series")) {
    return categoryForSeries();
  }
  return categoryForMovie();
}
