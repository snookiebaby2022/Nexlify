import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseVodAgentCmd } from "@/lib/vod-meta";
import { detectTitleLanguage, type TitleLanguage } from "@/lib/title-language";
import { invalidateXtreamVodAndSeriesCatalogs } from "@/lib/cache-invalidate";

export type ForeignVodKind = "MOVIE" | "SERIES";

export type ForeignVodItem = {
  id: string;
  name: string;
  categoryName: string;
  language: string;
  reason: TitleLanguage["reason"];
  confidence: "high" | "low";
};

type ScanRow = {
  id: string;
  name: string;
  seriesName: string | null;
  episodeNum: number | null;
  agentStartCmd: string | null;
  category: { name: string } | null;
};

function classifyRow(row: ScanRow): TitleLanguage {
  const meta = parseVodAgentCmd(row.agentStartCmd);
  const title = (row.seriesName || row.name || "").trim();
  return detectTitleLanguage(title, {
    categoryName: row.category?.name,
    meta,
  });
}

function rowIsForeign(row: ScanRow): boolean {
  return !classifyRow(row).english;
}

function toItem(row: ScanRow, lang: TitleLanguage): ForeignVodItem {
  return {
    id: row.id,
    name: (row.seriesName || row.name || "").trim() || row.name,
    categoryName: row.category?.name ?? "",
    language: lang.label,
    reason: lang.reason,
    confidence: lang.confidence,
  };
}

/** Movie rows, or series seed rows (not individual episodes). */
export async function findForeignVodIds(kind: ForeignVodKind): Promise<string[]> {
  const items = await findForeignVodItems(kind, Number.POSITIVE_INFINITY);
  return items.items.map((item) => item.id);
}

export async function findForeignVodItems(
  kind: ForeignVodKind,
  limit = 200
): Promise<{ count: number; items: ForeignVodItem[] }> {
  const type = kind === "SERIES" ? StreamType.SERIES : StreamType.MOVIE;
  const items: ForeignVodItem[] = [];
  let count = 0;
  let cursor: string | undefined;
  const take = Number.isFinite(limit) ? Math.max(1, limit) : Number.MAX_SAFE_INTEGER;
  for (;;) {
    const rows = await prisma.stream.findMany({
      where: {
        type,
        ...(kind === "SERIES"
          ? { OR: [{ episodeNum: null }, { episodeNum: 0 }] }
          : {}),
      },
      select: {
        id: true,
        name: true,
        seriesName: true,
        episodeNum: true,
        agentStartCmd: true,
        category: { select: { name: true } },
      },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (!rows.length) break;
    for (const row of rows) {
      const lang = classifyRow(row);
      if (lang.english) continue;
      count += 1;
      if (items.length < take) items.push(toItem(row, lang));
    }
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < 500) break;
  }
  return { count, items };
}

export async function deleteForeignVod(
  kind: ForeignVodKind,
  ids?: string[]
): Promise<{ deleted: number; ids: string[] }> {
  const selected = [...new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean))];
  const targetIds = selected.length ? selected : (await findForeignVodIds(kind));
  if (!targetIds.length) return { deleted: 0, ids: [] };

  if (kind === "SERIES") {
    const seeds = await prisma.stream.findMany({
      where: { id: { in: targetIds }, type: StreamType.SERIES },
      select: { id: true, name: true, seriesName: true },
    });
    const names = [...new Set(seeds.map((s) => (s.seriesName ?? s.name).trim()).filter(Boolean))];
    const result = await prisma.stream.deleteMany({
      where: {
        type: StreamType.SERIES,
        OR: [{ id: { in: targetIds } }, ...(names.length ? [{ seriesName: { in: names } }] : [])],
      },
    });
    await invalidateXtreamVodAndSeriesCatalogs().catch(() => {});
    return { deleted: result.count, ids: targetIds };
  }

  const result = await prisma.stream.deleteMany({
    where: { id: { in: targetIds }, type: StreamType.MOVIE },
  });
  await invalidateXtreamVodAndSeriesCatalogs().catch(() => {});
  return { deleted: result.count, ids: targetIds };
}
