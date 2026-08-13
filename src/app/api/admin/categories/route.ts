import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardStats, invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { PanelRole, CategoryType } from "@prisma/client";

const VALID_TYPES = new Set<string>(Object.values(CategoryType));

async function wouldCreateCycle(id: string, parentId: string | null): Promise<boolean> {
  if (!parentId) return false;
  if (parentId === id) return true;
  let current: string | null = parentId;
  const seen = new Set<string>([id]);
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    const row = await prisma.category.findUnique({ where: { id: current }, select: { parentId: true } });
    current = row?.parentId ?? null;
  }
  return false;
}

async function resolveParentId(raw: unknown): Promise<{ parentId: string | null; error?: string }> {
  if (raw == null || raw === "" || raw === false) return { parentId: null };
  const parentId = String(raw).trim();
  if (!parentId) return { parentId: null };
  const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { id: true } });
  if (!parent) return { parentId: null, error: "Parent category not found" };
  return { parentId };
}

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const typeFilter = req.nextUrl.searchParams.get("type")?.toUpperCase();
  try {
    const categories = await prisma.category.findMany({
      where:
        typeFilter && VALID_TYPES.has(typeFilter) ? { categoryType: typeFilter as CategoryType } : undefined,
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, sortOrder: true, categoryType: true, isAdult: true } },
        _count: { select: { streams: true, children: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ categories });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load categories" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const categoryType = VALID_TYPES.has(String(body.categoryType ?? "LIVE").toUpperCase())
      ? (String(body.categoryType).toUpperCase() as CategoryType)
      : CategoryType.LIVE;

    const parent = await resolveParentId(body.parentId);
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
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
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

    const data: {
      name?: string;
      categoryType?: CategoryType;
      isAdult?: boolean;
      parentId?: string | null;
      sortOrder?: number;
    } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      data.name = name;
    }
    if (body.categoryType && VALID_TYPES.has(String(body.categoryType).toUpperCase())) {
      data.categoryType = String(body.categoryType).toUpperCase() as CategoryType;
    }
    if (body.isAdult !== undefined) data.isAdult = Boolean(body.isAdult);
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;

    if (body.parentId !== undefined) {
      const parent = await resolveParentId(body.parentId);
      if (parent.error) return NextResponse.json({ error: parent.error }, { status: 400 });
      if (await wouldCreateCycle(id, parent.parentId)) {
        return NextResponse.json({ error: "Cannot set parent — would create a cycle" }, { status: 400 });
      }
      data.parentId = parent.parentId;
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
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    async function collectDescendants(parentId: string): Promise<string[]> {
      const children = await prisma.category.findMany({ where: { parentId }, select: { id: true } });
      let ids: string[] = [];
      for (const child of children) {
        ids.push(child.id);
        ids = ids.concat(await collectDescendants(child.id));
      }
      return ids;
    }

    const descendantIds = await collectDescendants(id);
    const allIds = [id, ...descendantIds];

    await prisma.stream.updateMany({
      where: { categoryId: { in: allIds } },
      data: { categoryId: null },
    });
    if (descendantIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: descendantIds } } });
    }
    await prisma.category.delete({ where: { id } });

    await invalidateXtreamCategories();
    await invalidateDashboardStats();
    return NextResponse.json({ ok: true, deleted: allIds.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete category" },
      { status: 400 }
    );
  }
}
