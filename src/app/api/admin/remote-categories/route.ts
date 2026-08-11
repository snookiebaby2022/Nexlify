import { NextRequest, NextResponse } from "next/server";
import { requirePanelApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateXtreamCategories, invalidateDashboardStats } from "@/lib/cache-invalidate";
import { CategoryType } from "@prisma/client";

const VALID_TYPES = new Set<string>(Object.values(CategoryType));

type IncomingCategory = {
  name: string;
  categoryType?: string;
  isAdult?: boolean;
  sortOrder?: number;
  parentId?: string | null;
};

/**
 * Remote categories endpoint — called by the marketing site admin.
 * Accepts a list of categories and upserts them by name+type.
 * If a category with the same name+type exists, it is updated; otherwise created.
 * Requires the panel API secret (x-panel-api-key or Authorization).
 */
export async function POST(req: NextRequest) {
  const ok = await requirePanelApiKey(req);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { categories, deleteMissing } = body as {
    categories: IncomingCategory[];
    deleteMissing?: boolean;
  };

  if (!Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ error: "categories array required" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const errors: string[] = [];

  for (const incoming of categories) {
    if (!incoming.name || typeof incoming.name !== "string") {
      errors.push("Skipped category with missing name");
      continue;
    }

    const categoryType = VALID_TYPES.has(String(incoming.categoryType ?? "LIVE").toUpperCase())
      ? (String(incoming.categoryType).toUpperCase() as CategoryType)
      : CategoryType.LIVE;

    const existing = await prisma.category.findFirst({
      where: { name: incoming.name.trim(), categoryType },
    });

    if (existing) {
      const needsUpdate =
        existing.isAdult !== (incoming.isAdult === true) ||
        existing.sortOrder !== (incoming.sortOrder ?? 0) ||
        existing.parentId !== (incoming.parentId || null);

      if (needsUpdate) {
        await prisma.category.update({
          where: { id: existing.id },
          data: {
            isAdult: incoming.isAdult === true,
            sortOrder: incoming.sortOrder ?? 0,
            parentId: incoming.parentId || null,
          },
        });
        updated++;
      } else {
        unchanged++;
      }
    } else {
      await prisma.category.create({
        data: {
          name: incoming.name.trim(),
          categoryType,
          isAdult: incoming.isAdult === true,
          sortOrder: incoming.sortOrder ?? 0,
          parentId: incoming.parentId || null,
        },
      });
      created++;
    }
  }

  // Optionally delete categories not in the incoming list
  if (deleteMissing && categories.length > 0) {
    const incomingNames = categories.map((c) => c.name.trim().toLowerCase());
    const incomingTypes = categories.map((c) =>
      VALID_TYPES.has(String(c.categoryType ?? "LIVE").toUpperCase())
        ? String(c.categoryType).toUpperCase()
        : "LIVE"
    );

    const existingAll = await prisma.category.findMany({
      select: { id: true, name: true, categoryType: true },
    });

    const toDelete = existingAll.filter(
      (e) =>
        !incomingNames.includes(e.name.toLowerCase()) ||
        !incomingTypes.includes(e.categoryType)
    );

    if (toDelete.length > 0) {
      const deleteIds = toDelete.map((d) => d.id);
      // Un-categorize streams in these categories
      await prisma.stream.updateMany({
        where: { categoryId: { in: deleteIds } },
        data: { categoryId: null },
      });
      await prisma.category.deleteMany({ where: { id: { in: deleteIds } } });
    }
  }

  await invalidateXtreamCategories();
  await invalidateDashboardStats();

  return NextResponse.json({
    ok: true,
    created,
    updated,
    unchanged,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * GET — list current categories on this panel.
 */
export async function GET(req: NextRequest) {
  const ok = await requirePanelApiKey(req);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const typeFilter = req.nextUrl.searchParams.get("type")?.toUpperCase();
  const categories = await prisma.category.findMany({
    where: typeFilter && VALID_TYPES.has(typeFilter) ? { categoryType: typeFilter as CategoryType } : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ categories });
}
