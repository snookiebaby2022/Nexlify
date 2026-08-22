import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardStats, invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { CategoryType, PanelRole } from "@prisma/client";
import {
  buildAutoSortUpdates,
  CATEGORY_SORT_PRESETS,
  previewAutoSort,
  resolveSortLines,
  type CategorySortPresetId,
} from "@/lib/category-auto-sort";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

const VALID_TYPES = new Set<string>(Object.values(CategoryType));
const VALID_PRESETS = new Set<string>([
  ...Object.keys(CATEGORY_SORT_PRESETS),
  "custom",
]);

export async function GET() {
  return NextResponse.json({
    presets: Object.values(CATEGORY_SORT_PRESETS).map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      lines: p.lines,
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const categoryTypeRaw = String(body.categoryType ?? "LIVE").toUpperCase();
    if (!VALID_TYPES.has(categoryTypeRaw)) {
      return NextResponse.json({ error: "Invalid categoryType" }, { status: 400 });
    }
    const categoryType = categoryTypeRaw as CategoryType;

    const preset = String(body.preset ?? "uk-sports-us") as CategorySortPresetId;
    if (!VALID_PRESETS.has(preset)) {
      return NextResponse.json({ error: "Invalid preset" }, { status: 400 });
    }

    const customLines = Array.isArray(body.customLines)
      ? body.customLines.map((l: unknown) => String(l))
      : typeof body.customLines === "string"
        ? body.customLines.split(/\r?\n/)
        : null;

    const lines = resolveSortLines(preset, customLines);
    const dryRun = body.dryRun === true;

    const rows = await prisma.category.findMany({
      where: { categoryType },
      select: { id: true, name: true, parentId: true, sortOrder: true },
    });

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        categoryType,
        preset,
        lines,
        preview: previewAutoSort(rows, lines).slice(0, 40),
        total: rows.length,
      });
    }

    const updates = buildAutoSortUpdates(rows, lines);
    if (updates.length) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.category.update({ where: { id: u.id }, data: { sortOrder: u.sortOrder } })
        )
      );
    }

    await invalidateXtreamCategories();
    await invalidateDashboardStats();

    return NextResponse.json({
      ok: true,
      categoryType,
      preset,
      updated: updates.length,
      total: rows.length,
    });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
