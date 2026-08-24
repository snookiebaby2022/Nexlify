import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { repairImportedPanel } from "@/lib/repair-imported-panel";
import { repairBouquetCategorySplit } from "@/lib/repair-bouquet-category-split";
import {
  deleteDuplicateStreams,
  findDuplicateGroups,
  type DuplicateKind,
} from "@/lib/stream-duplicates";
import { invalidateXtreamCategories, invalidateDashboardStats } from "@/lib/cache-invalidate";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

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

/** POST — repair post-import data (activate streams, merge duplicate categories, optional dedupe). */
export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const dedupeStreams = body?.dedupeStreams !== false;

    const result = await repairImportedPanel(prisma);
    const bouquetCategory = await repairBouquetCategorySplit(prisma);

    const duplicates: Partial<
      Record<DuplicateKind, { scanned: number; extraCopies: number; groups: number; deleted: number }>
    > = {};
    if (dedupeStreams) {
      for (const kind of ["live", "movies", "series"] as const) {
        const scan = await findDuplicateGroups(kind);
        const toDelete: string[] = [];
        for (const g of scan.groups) {
          for (const m of g.members) {
            if (m.id !== g.keepId) toDelete.push(m.id);
          }
        }
        const { deleted } = toDelete.length
          ? await deleteDuplicateStreams(toDelete)
          : { deleted: 0 };
        duplicates[kind] = {
          scanned: scan.scanned,
          extraCopies: scan.extraCopies,
          groups: scan.groups.length,
          deleted,
        };
      }
    }

    await invalidateXtreamCategories();
    await invalidateDashboardStats().catch(() => {});
    return NextResponse.json({ ok: true, result: { ...result, bouquetCategory, duplicates } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
