import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardStats, invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { CategoryType, PanelRole } from "@prisma/client";
import { normalizeCategoryNamesToXui } from "@/lib/normalize-category-names";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

const VALID_TYPES = new Set<string>(Object.values(CategoryType));

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const categoryTypeRaw = body.categoryType ? String(body.categoryType).toUpperCase() : "";
    const categoryType =
      categoryTypeRaw && VALID_TYPES.has(categoryTypeRaw)
        ? (categoryTypeRaw as CategoryType)
        : undefined;

    const dryRun = body.dryRun === true;
    const result = await normalizeCategoryNamesToXui(prisma, { categoryType, dryRun });

    if (!dryRun) {
      await invalidateXtreamCategories();
      await invalidateDashboardStats();
    }

    return NextResponse.json({ ok: true, dryRun, categoryType: categoryType ?? "ALL", ...result });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
