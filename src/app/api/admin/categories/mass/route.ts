import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { invalidateXtreamCategories, invalidateDashboardStats } from "@/lib/cache-invalidate";
import { PanelRole, CategoryType } from "@prisma/client";
import {
  collectDescendantCategoryIds,
  deleteCategoriesSafe,
  expandCategoryFilter,
} from "@/lib/category-tree";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

async function allCategoryIdsWithDescendants(ids: string[]): Promise<string[]> {
  const all = new Set<string>();
  for (const id of ids) {
    all.add(id);
    for (const d of await collectDescendantCategoryIds(id)) all.add(d);
  }
  return [...all];
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data as Record<string, unknown>;
    const ids: string[] = (body.ids as string[]) ?? [];
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

    const action = body.action as string;
    let count = 0;

    if (action === "delete") {
      const moveTo =
        body.moveStreamsToCategoryId != null && body.moveStreamsToCategoryId !== ""
          ? String(body.moveStreamsToCategoryId)
          : null;
      if (moveTo) {
        const target = await prisma.category.findUnique({
          where: { id: moveTo },
          select: { id: true },
        });
        if (!target) return NextResponse.json({ error: "Target category not found" }, { status: 400 });
      }
      const allIds = await allCategoryIdsWithDescendants(ids);
      if (moveTo) {
        await prisma.stream.updateMany({
          where: { categoryId: { in: allIds } },
          data: { categoryId: moveTo },
        });
      }
      await deleteCategoriesSafe(allIds);
      count = allIds.length;
      await invalidateXtreamCategories();
      await invalidateDashboardStats();
    } else if (action === "setAdult" && body.isAdult !== undefined) {
      const r = await prisma.category.updateMany({
        where: { id: { in: ids } },
        data: { isAdult: Boolean(body.isAdult) },
      });
      count = r.count;
      await invalidateXtreamCategories();
    } else if (action === "setSortOrder" && body.sortOrder !== undefined) {
      const sortOrder = Number(body.sortOrder);
      if (!Number.isFinite(sortOrder)) {
        return NextResponse.json({ error: "Invalid sort order" }, { status: 400 });
      }
      const r = await prisma.category.updateMany({
        where: { id: { in: ids } },
        data: { sortOrder: Math.round(sortOrder) },
      });
      count = r.count;
    } else if (action === "enableStreams" || action === "disableStreams") {
      const active = action === "enableStreams";
      for (const id of ids) {
        const catIds = await expandCategoryFilter(id);
        const r = await prisma.stream.updateMany({
          where: { categoryId: { in: catIds } },
          data: { isActive: active },
        });
        count += r.count;
      }
    } else if (action === "clearStreams") {
      for (const id of ids) {
        const catIds = await expandCategoryFilter(id);
        const r = await prisma.stream.updateMany({
          where: { categoryId: { in: catIds } },
          data: { categoryId: null },
        });
        count += r.count;
      }
      await invalidateXtreamCategories();
    } else if (action === "moveStreams" && body.moveStreamsToCategoryId !== undefined) {
      const moveTo =
        body.moveStreamsToCategoryId === null || body.moveStreamsToCategoryId === ""
          ? null
          : String(body.moveStreamsToCategoryId);
      if (moveTo) {
        const target = await prisma.category.findUnique({
          where: { id: moveTo },
          select: { id: true, categoryType: true },
        });
        if (!target) return NextResponse.json({ error: "Target category not found" }, { status: 400 });
      }
      for (const id of ids) {
        const catIds = await expandCategoryFilter(id);
        const r = await prisma.stream.updateMany({
          where: { categoryId: { in: catIds } },
          data: { categoryId: moveTo },
        });
        count += r.count;
      }
      await invalidateXtreamCategories();
    } else if (action === "setType" && body.categoryType) {
      const t = String(body.categoryType).toUpperCase();
      if (!Object.values(CategoryType).includes(t as CategoryType)) {
        return NextResponse.json({ error: "Invalid category type" }, { status: 400 });
      }
      const r = await prisma.category.updateMany({
        where: { id: { in: ids } },
        data: { categoryType: t as CategoryType },
      });
      count = r.count;
      await invalidateXtreamCategories();
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await logActivity(`mass_categories_${action}`, {
      userId: session.id,
      meta: { count, action, ids: ids.slice(0, 20) },
    });

    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
