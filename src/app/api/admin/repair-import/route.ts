import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { repairImportedPanel } from "@/lib/repair-imported-panel";
import { invalidateXtreamCategories, invalidateDashboardStats } from "@/lib/cache-invalidate";

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
