import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, Prisma, StreamType } from "@prisma/client";

type SeriesAggRow = {
  id: string;
  name: string;
  episode_count: bigint | number;
  stream_icon: string | null;
  is_active: boolean;
  category_name: string | null;
  total_count: bigint | number;
};

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(sp.get("pageSize") || 50) || 50));
  const search = (sp.get("search") || "").trim();
  const categoryId = (sp.get("categoryId") || "").trim();
  const offset = (page - 1) * pageSize;

  try {
    const filters: Prisma.Sql[] = [Prisma.sql`s.type = 'SERIES'::"StreamType"`];
    if (categoryId) {
      filters.push(Prisma.sql`s."categoryId" = ${categoryId}`);
    }
    if (search) {
      const like = `%${search}%`;
      filters.push(
        Prisma.sql`(COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name) ILIKE ${like} OR c.name ILIKE ${like})`
      );
    }
    const whereSql = Prisma.join(filters, " AND ");

    const rows = await prisma.$queryRaw<SeriesAggRow[]>`
      WITH grouped AS (
        SELECT
          MIN(s.id) FILTER (WHERE s."episodeNum" IS NULL OR s."episodeNum" <= 0) AS parent_id,
          MIN(s.id) AS any_id,
          COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name) AS series_label,
          COUNT(*) FILTER (WHERE s."episodeNum" IS NOT NULL AND s."episodeNum" > 0)::bigint AS episode_count,
          MAX(s."streamIcon") FILTER (WHERE s."episodeNum" IS NULL OR s."episodeNum" <= 0) AS parent_icon,
          MAX(s."streamIcon") AS any_icon,
          BOOL_OR(s."isActive") FILTER (WHERE s."episodeNum" IS NULL OR s."episodeNum" <= 0) AS parent_active,
          BOOL_OR(s."isActive") AS any_active,
          MAX(c.name) FILTER (WHERE s."episodeNum" IS NULL OR s."episodeNum" <= 0) AS parent_cat,
          MAX(c.name) AS any_cat
        FROM "Stream" s
        LEFT JOIN "Category" c ON c.id = s."categoryId"
        WHERE ${whereSql}
        GROUP BY LOWER(COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name))
      )
      SELECT
        COALESCE(parent_id, any_id) AS id,
        series_label AS name,
        episode_count,
        COALESCE(parent_icon, any_icon) AS stream_icon,
        COALESCE(parent_active, any_active, true) AS is_active,
        COALESCE(parent_cat, any_cat) AS category_name,
        COUNT(*) OVER()::bigint AS total_count
      FROM grouped
      ORDER BY series_label ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const total = rows.length ? Number(rows[0].total_count) : 0;
    const series = rows.map((r) => ({
      id: r.id,
      name: r.name,
      episodeCount: Number(r.episode_count),
      streamIcon: r.stream_icon,
      isActive: Boolean(r.is_active),
      categoryName: r.category_name,
    }));

    return NextResponse.json({ series, total, page, pageSize });
  } catch (e) {
    // Fallback for DBs without FILTER support — still paginate in memory after light select
    try {
      const where: Prisma.StreamWhereInput = {
        type: StreamType.SERIES,
        ...(categoryId ? { categoryId } : {}),
        ...(search
          ? {
              OR: [
                { seriesName: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { category: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      };
      const all = await prisma.stream.findMany({
        where,
        select: {
          id: true,
          name: true,
          seriesName: true,
          episodeNum: true,
          streamIcon: true,
          isActive: true,
          category: { select: { name: true } },
        },
        orderBy: [{ seriesName: "asc" }, { name: "asc" }],
      });
      type SeriesRow = {
        id: string;
        name: string;
        episodeCount: number;
        streamIcon: string | null;
        isActive: boolean;
        categoryName: string | null;
      };
      const groups = new Map<string, SeriesRow>();
      for (const row of all) {
        const name = (row.seriesName ?? row.name).trim() || row.name;
        const key = name.toLowerCase();
        const isEpisode = row.episodeNum != null && row.episodeNum > 0;
        const existing = groups.get(key);
        if (!existing) {
          groups.set(key, {
            id: row.id,
            name,
            episodeCount: isEpisode ? 1 : 0,
            streamIcon: row.streamIcon,
            isActive: row.isActive,
            categoryName: row.category?.name ?? null,
          });
          continue;
        }
        if (isEpisode) existing.episodeCount += 1;
        else {
          existing.id = row.id;
          existing.streamIcon = row.streamIcon ?? existing.streamIcon;
          existing.isActive = row.isActive;
          existing.categoryName = row.category?.name ?? existing.categoryName;
        }
      }
      const seriesAll = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
      const total = seriesAll.length;
      const series = seriesAll.slice(offset, offset + pageSize);
      return NextResponse.json({ series, total, page, pageSize });
    } catch (err) {
      return NextResponse.json({
        series: [],
        total: 0,
        page,
        pageSize,
        error: err instanceof Error ? err.message : e instanceof Error ? e.message : "Failed to load series",
      });
    }
  }
}
