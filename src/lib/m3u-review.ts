import { parseM3u, type M3uEntry } from "@/lib/m3u-parser";

export type M3uReviewEntry = M3uEntry & {
  id: string;
  duplicateOf?: string;
  selected: boolean;
};

export type M3uReviewResult = {
  entries: M3uReviewEntry[];
  duplicates: number;
  truncated: boolean;
  totalParsed: number;
  uniqueCount: number;
  groups: { name: string; count: number }[];
  withLogo: number;
};

const REVIEW_LIMIT = 500;

function normUrl(url: string) {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

function normName(name: string) {
  return name.trim().toLowerCase();
}

export function buildM3uReview(content: string): M3uReviewResult {
  const parsed = parseM3u(content);
  const truncated = parsed.length > REVIEW_LIMIT;
  const slice = parsed.slice(0, REVIEW_LIMIT);

  const urlIndex = new Map<string, number>();
  const nameIndex = new Map<string, number>();
  let duplicates = 0;

  const entries: M3uReviewEntry[] = slice.map((entry, i) => {
    const id = `m3u-${i}`;
    const nu = normUrl(entry.url);
    const nn = normName(entry.name);
    let duplicateOf: string | undefined;

    if (urlIndex.has(nu)) {
      duplicateOf = `m3u-${urlIndex.get(nu)!}`;
      duplicates += 1;
    } else if (nameIndex.has(nn)) {
      duplicateOf = `m3u-${nameIndex.get(nn)!}`;
      duplicates += 1;
    } else {
      urlIndex.set(nu, i);
      nameIndex.set(nn, i);
    }

    return { ...entry, id, duplicateOf, selected: !duplicateOf };
  });

  const groupMap = new Map<string, number>();
  let withLogo = 0;
  for (const entry of parsed) {
    const g = entry.group?.trim() || "Uncategorized";
    groupMap.set(g, (groupMap.get(g) ?? 0) + 1);
    if (entry.logo?.trim()) withLogo += 1;
  }
  const groups = [...groupMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    entries,
    duplicates,
    truncated,
    totalParsed: parsed.length,
    uniqueCount: parsed.length - duplicates,
    groups,
    withLogo,
  };
}
