import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardStats, invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { PanelRole, CategoryType } from "@prisma/client";

const VALID_TYPES = new Set<string>(Object.values(CategoryType));

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const typeFilter = req.nextUrl.searchParams.get("type")?.toUpperCase();
  const categories = await prisma.category.findMany({
    where: typeFilter && VALID_TYPES.has(typeFilter) ? { categoryType: typeFilter as CategoryType } : undefined,
    include: {
      parent: { select: { name: true } },
      _count: { select: { streams: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const categoryType = VALID_TYPES.has(String(body.categoryType ?? "LIVE").toUpperCase())
    ? (String(body.categoryType).toUpperCase() as CategoryType)
    : CategoryType.LIVE;

  const category = await prisma.category.create({
    data: {
      name: body.name,
      sortOrder: Number(body.sortOrder ?? 0),
      parentId: body.parentId || null,
      categoryType,
      isAdult: body.isAdult === true,
    },
  });
  await invalidateXtreamCategories();
  await invalidateDashboardStats();
  return NextResponse.json({ category });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const order = body.order as string[] | undefined;
  if (order?.length) {
    await prisma.$transaction(
      order.map((id, index) =>
        prisma.category.update({ where: { id }, data: { sortOrder: index } })
      )
    );
    await invalidateXtreamCategories();
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id or order required" }, { status: 400 });

  const category = await prisma.category.update({
    where: { id },
    data: {
      name: body.name !== undefined ? String(body.name) : undefined,
      categoryType:
        body.categoryType && VALID_TYPES.has(String(body.categoryType).toUpperCase())
          ? (String(body.categoryType).toUpperCase() as CategoryType)
          : undefined,
      isAdult: body.isAdult !== undefined ? Boolean(body.isAdult) : undefined,
      parentId: body.parentId !== undefined ? body.parentId || null : undefined,
    },
  });
  await invalidateXtreamCategories();
  return NextResponse.json({ category });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.stream.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
  await prisma.category.delete({ where: { id } });
  await invalidateXtreamCategories();
  await invalidateDashboardStats();
  return NextResponse.json({ ok: true });
}
