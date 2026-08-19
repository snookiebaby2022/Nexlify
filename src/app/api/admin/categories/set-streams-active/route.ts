import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { collectDescendantCategoryIds } from "@/lib/category-tree";
import { logActivity } from "@/lib/lines";
import { invalidateXtreamCategories, invalidateDashboardStats } from "@/lib/cache-invalidate";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
/**
 * POST — set all streams in a category (and descendants) active or offline.
 * Body: { categoryId: string, isActive: boolean, includeDescendants?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const categoryId = String(body.categoryId ?? "").trim();
  if (!categoryId) {
    return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  }
  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive boolean required" }, { status: 400 });
  }

  const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, name: true } });
  if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const includeDescendants = body.includeDescendants !== false;
  const ids = includeDescendants
    ? await collectDescendantCategoryIds(categoryId)
    : [categoryId];

  const result = await prisma.stream.updateMany({
    where: { categoryId: { in: ids } },
    data: { isActive: body.isActive },
  });

  await logActivity(body.isActive ? "category_streams_enable" : "category_streams_disable", {
    userId: session.id,
    entity: "category",
    entityId: categoryId,
    meta: { count: result.count, includeDescendants },
  });

  await invalidateXtreamCategories().catch(() => {});
  await invalidateDashboardStats().catch(() => {});

  return NextResponse.json({
    ok: true,
    updated: result.count,
    categoryId,
    isActive: body.isActive,
  });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
