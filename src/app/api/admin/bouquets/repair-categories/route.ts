import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { repairBouquetCategorySplit } from "@/lib/repair-bouquet-category-split";
import { logActivity } from "@/lib/lines";

/**
 * POST — merge category-named orphan bouquets into package bouquets,
 * merge duplicate categories, fix sortOrder for IPTV apps.
 */
export async function POST(_req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await repairBouquetCategorySplit(prisma);
    try {
      await logActivity("repair_bouquet_categories", {
        userId: session.id,
        entity: "bouquet",
        meta: result as unknown as Record<string, unknown>,
      });
    } catch {
      /* non-fatal */
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[repair-bouquet-categories]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Repair failed" },
      { status: 500 }
    );
  }
}
