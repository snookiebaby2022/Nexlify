import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardStats, invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { cacheGetOrSet } from "@/lib/cache";
import { PanelRole, CategoryType } from "@prisma/client";
import {
  collectDescendantCategoryIds,
  deleteCategoriesSafe,
  resolveCategoryParent,
  wouldCreateCategoryCycle,
} from "@/lib/category-tree";
import { formatXuiCategoryName } from "@/lib/category-xui-name";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
const VALID_TYPES = new Set<string>(Object.values(CategoryType));

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const typeFilter = req.nextUrl.searchParams.get("type")?.toUpperCase();
  const lite = req.nextUrl.searchParams.get("lite") === "1";
  const where =
    typeFilter && VALID_TYPES.has(typeFilter) ? { categoryType: typeFilter as CategoryType } : undefined;
  try {
    if (lite) {
      const categories = await prisma.category.findMany({
        where,
        include: { parent: { select: { id: true, name: true } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return NextResponse.json({
        categories: categories.map((c) => ({
          ...c,
          activeCount: 0,
          inactiveCount: 0,
          _count: { streams: 0, children: 0 },
        })),
      });
    }

    const categories = await prisma.category.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, sortOrder: true, categoryType: true, isAdult: true } },
        _count: {
          select: {
            streams: true,
            children: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    // Active / inactive counts per category (cached — heavy on large catalogs).
    const counts = await cacheGetOrSet("categories:stream-counts", 60, async () => {
      const [activeGroups, inactiveGroups] = await Promise.all([
        prisma.stream.groupBy({
          by: ["categoryId"],
          where: { isActive: true, categoryId: { not: null } },
          _count: true,
        }),
        prisma.stream.groupBy({
          by: ["categoryId"],
          where: { isActive: false, categoryId: { not: null } },
          _count: true,
        }),
      ]);
      const active: Record<string, number> = {};
      const inactive: Record<string, number> = {};
      for (const g of activeGroups) {
        if (g.categoryId) active[g.categoryId] = g._count;
      }
      for (const g of inactiveGroups) {
        if (g.categoryId) inactive[g.categoryId] = g._count;
      }
      return { active, inactive };
    });
    const activeMap = new Map(Object.entries(counts.active));
    const inactiveMap = new Map(Object.entries(counts.inactive));

    return NextResponse.json({
      categories: categories.map((c) => ({
        ...c,
        activeCount: activeMap.get(c.id) ?? 0,
        inactiveCount: inactiveMap.get(c.id) ?? 0,
        _count: {
          ...c._count,
          // Keep streams as total so existing UI still works; prefer activeCount for “online”.
          streams: c._count.streams,
        },
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load categories" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const name = formatXuiCategoryName(String(body.name ?? "").trim(), {
      isAdult: body.isAdult === true,
    });
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const categoryType = VALID_TYPES.has(String(body.categoryType ?? "LIVE").toUpperCase())
      ? (String(body.categoryType).toUpperCase() as CategoryType)
      : CategoryType.LIVE;

    const parent = await resolveCategoryParent({
      parentId: body.parentId,
      childType: categoryType,
    });
    if (parent.error) return NextResponse.json({ error: parent.error }, { status: 400 });

    const category = await prisma.category.create({
      data: {
        name,
        sortOrder: Number(body.sortOrder ?? 0) || 0,
        parentId: parent.parentId,
        categoryType,
        isAdult: body.isAdult === true,
      },
    });
    await invalidateXtreamCategories();
    await invalidateDashboardStats();
    return NextResponse.json({ category });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create category" },
      { status: 400 }
    );
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const order = body.order as string[] | undefined;
    if (order?.length) {
      for (let index = 0; index < order.length; index++) {
        const id = order[index];
        if (!id) continue;
        try {
          await prisma.category.update({ where: { id }, data: { sortOrder: index } });
        } catch {
          /* skip missing ids */
        }
      }
      await invalidateXtreamCategories();
      return NextResponse.json({ ok: true });
    }

    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "id or order required" }, { status: 400 });

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    const data: {
      name?: string;
      categoryType?: CategoryType;
      isAdult?: boolean;
      parentId?: string | null;
      sortOrder?: number;
    } = {};

    if (body.name !== undefined) {
      const raw = String(body.name).trim();
      if (!raw) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      data.name = formatXuiCategoryName(raw, {
        isAdult: body.isAdult !== undefined ? Boolean(body.isAdult) : existing.isAdult,
      });
    }
    if (body.categoryType && VALID_TYPES.has(String(body.categoryType).toUpperCase())) {
      data.categoryType = String(body.categoryType).toUpperCase() as CategoryType;
    }
    if (body.isAdult !== undefined) data.isAdult = Boolean(body.isAdult);
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;

    const nextType = data.categoryType ?? existing.categoryType;

    if (body.parentId !== undefined) {
      const parent = await resolveCategoryParent({
        parentId: body.parentId,
        childType: nextType,
      });
      if (parent.error) return NextResponse.json({ error: parent.error }, { status: 400 });
      if (await wouldCreateCategoryCycle(id, parent.parentId)) {
        return NextResponse.json({ error: "Cannot set parent — would create a cycle" }, { status: 400 });
      }
      data.parentId = parent.parentId;
    } else if (data.categoryType && data.categoryType !== existing.categoryType && existing.parentId) {
      // Type change: clear parent if it would become cross-type
      const parent = await prisma.category.findUnique({
        where: { id: existing.parentId },
        select: { categoryType: true },
      });
      if (parent && parent.categoryType !== data.categoryType) {
        data.parentId = null;
      }
    }

    const category = await prisma.category.update({ where: { id }, data });
    await invalidateXtreamCategories();
    return NextResponse.json({ category });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update category" },
      { status: 400 }
    );
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const descendantIds = await collectDescendantCategoryIds(id);
    const allIds = [id, ...descendantIds];
    await deleteCategoriesSafe(allIds);

    await invalidateXtreamCategories();
    await invalidateDashboardStats();
    return NextResponse.json({ ok: true, deleted: allIds.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete category" },
      { status: 400 }
    );
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
