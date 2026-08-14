import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { repairImportedPanel } from "@/lib/repair-imported-panel";
import { invalidateXtreamCategories, invalidateDashboardStats } from "@/lib/cache-invalidate";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [
      streams,
      live,
      movie,
      series,
      uncategorized,
      noUrl,
      inactive,
      bouquets,
      categories,
      linked,
      lines,
      linesWithoutBouquets,
    ] = await Promise.all([
        prisma.stream.count(),
        prisma.stream.count({ where: { type: "LIVE" } }),
        prisma.stream.count({ where: { type: "MOVIE" } }),
        prisma.stream.count({ where: { type: "SERIES" } }),
        prisma.stream.count({ where: { categoryId: null } }),
        prisma.stream.count({
          where: {
            OR: [{ streamUrl: "" }, { streamUrl: { startsWith: "pending://" } }],
          },
        }),
        prisma.stream.count({ where: { isActive: false } }),
        prisma.bouquet.count(),
        prisma.category.count(),
        prisma.bouquetStream.count(),
        prisma.line.count(),
        prisma.line.count({ where: { bouquets: { none: {} } } }),
      ]);
    const liveOrphans = await prisma.stream.count({
      where: { type: "LIVE", bouquets: { none: {} } },
    });
    return NextResponse.json({
      streams,
      live,
      movie,
      series,
      uncategorized,
      noUrl,
      inactive,
      bouquets,
      categories,
      bouquetLinks: linked,
      liveOrphans,
      lines,
      linesWithoutBouquets,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load import health" },
      { status: 500 }
    );
  }
}

/** POST — repair post-import data (activate streams, fix packages, groups, alpha order). */
export async function POST(_req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await repairImportedPanel(prisma);
    await invalidateXtreamCategories();
    await invalidateDashboardStats().catch(() => {});
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
