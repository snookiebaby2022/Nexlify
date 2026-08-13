import { NextRequest, NextResponse } from "next/server";
import { requirePanelApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateXtreamCategories, invalidateDashboardStats } from "@/lib/cache-invalidate";
import { CategoryType } from "@prisma/client";
import {
  clearAllCategoriesSafe,
  deleteCategoriesSafe,
  resolveCategoryParent,
  wouldCreateCategoryCycle,
} from "@/lib/category-tree";

const VALID_TYPES = new Set<string>(Object.values(CategoryType));

type IncomingCategory = {
  name: string;
  categoryType?: string;
  isAdult?: boolean;
  sortOrder?: number;
  parentId?: string | null;
  parentName?: string | null;
};

function resolveType(raw: unknown): CategoryType {
  const t = String(raw ?? "LIVE").toUpperCase();
  return VALID_TYPES.has(t) ? (t as CategoryType) : CategoryType.LIVE;
}

/**
 * Remote categories endpoint — called by the marketing site admin.
 * Accepts a list of categories and upserts them by name+type.
 * Parent links are applied in a second pass (by id or parentName).
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

  // Pass 1: upsert without parents (avoids FK failures on remote ids)
  const nameTypeToId = new Map<string, string>();
  for (const incoming of categories) {
    if (!incoming.name || typeof incoming.name !== "string") {
      errors.push("Skipped category with missing name");
      continue;
    }
    const name = incoming.name.trim();
    if (!name) {
      errors.push("Skipped category with empty name");
      continue;
    }
    const categoryType = resolveType(incoming.categoryType);
    const key = `${categoryType}::${name.toLowerCase()}`;

    const existing = await prisma.category.findFirst({
      where: { name, categoryType },
    });

    if (existing) {
      const needsUpdate =
        existing.isAdult !== (incoming.isAdult === true) ||
        existing.sortOrder !== (incoming.sortOrder ?? 0);
      if (needsUpdate) {
        await prisma.category.update({
          where: { id: existing.id },
          data: {
            isAdult: incoming.isAdult === true,
            sortOrder: incoming.sortOrder ?? 0,
          },
        });
        updated++;
      } else {
        unchanged++;
      }
      nameTypeToId.set(key, existing.id);
    } else {
      const row = await prisma.category.create({
        data: {
          name,
          categoryType,
          isAdult: incoming.isAdult === true,
          sortOrder: incoming.sortOrder ?? 0,
          parentId: null,
        },
      });
      nameTypeToId.set(key, row.id);
      created++;
    }
  }

  // Pass 2: apply parent links
  for (const incoming of categories) {
    if (!incoming.name || typeof incoming.name !== "string") continue;
    const name = incoming.name.trim();
    if (!name) continue;
    const categoryType = resolveType(incoming.categoryType);
    const key = `${categoryType}::${name.toLowerCase()}`;
    const id = nameTypeToId.get(key);
    if (!id) continue;

    let desiredParent: string | null = null;
    if (incoming.parentName && String(incoming.parentName).trim()) {
      const parentKey = `${categoryType}::${String(incoming.parentName).trim().toLowerCase()}`;
      desiredParent = nameTypeToId.get(parentKey) ?? null;
      if (!desiredParent) {
        const parent = await prisma.category.findFirst({
          where: { name: String(incoming.parentName).trim(), categoryType },
          select: { id: true },
        });
        desiredParent = parent?.id ?? null;
      }
    } else if (incoming.parentId) {
      const resolved = await resolveCategoryParent({
        parentId: incoming.parentId,
        childType: categoryType,
      });
      if (resolved.error) {
        // parentId may be a remote id — try as name fallback
        const parent = await prisma.category.findFirst({
          where: { name: String(incoming.parentId).trim(), categoryType },
          select: { id: true },
        });
        desiredParent = parent?.id ?? null;
      } else {
        desiredParent = resolved.parentId;
      }
    }

    if (desiredParent && (await wouldCreateCategoryCycle(id, desiredParent))) {
      errors.push(`Skipped parent for "${name}" — would create a cycle`);
      desiredParent = null;
    }

    const current = await prisma.category.findUnique({
      where: { id },
      select: { parentId: true },
    });
    if (current && current.parentId !== desiredParent) {
      await prisma.category.update({ where: { id }, data: { parentId: desiredParent } });
      if (desiredParent) updated++;
    }
  }

  if (deleteMissing && categories.length > 0) {
    const incomingKeys = new Set(
      categories
        .filter((c) => c.name && typeof c.name === "string" && c.name.trim())
        .map((c) => `${resolveType(c.categoryType)}::${c.name.trim().toLowerCase()}`)
    );
    const typesInSync = new Set(
      categories.map((c) => resolveType(c.categoryType))
    );

    const existingAll = await prisma.category.findMany({
      select: { id: true, name: true, categoryType: true },
    });

    const toDelete = existingAll.filter((e) => {
      if (!typesInSync.has(e.categoryType)) return false;
      return !incomingKeys.has(`${e.categoryType}::${e.name.toLowerCase()}`);
    });

    if (toDelete.length > 0) {
      await deleteCategoriesSafe(toDelete.map((d) => d.id));
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

/** DELETE all categories (safe for self-FK). Requires panel API key + confirm. */
export async function DELETE(req: NextRequest) {
  const ok = await requirePanelApiKey(req);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const confirm = req.nextUrl.searchParams.get("confirm");
  if (confirm !== "all") {
    return NextResponse.json({ error: "Pass confirm=all to clear categories" }, { status: 400 });
  }
  await clearAllCategoriesSafe();
  await invalidateXtreamCategories();
  await invalidateDashboardStats();
  return NextResponse.json({ ok: true });
}
