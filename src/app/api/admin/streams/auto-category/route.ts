import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole, Prisma, StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { logActivity } from "@/lib/lines";
import { autoAssignCategories } from "@/lib/stream-auto-category";

function parseType(raw: unknown): StreamType | null {
  const t = String(raw ?? "").toUpperCase();
  if (t === "LIVE" || t === "MOVIE" || t === "SERIES") return t;
  return null;
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data as {
      streamIds?: unknown;
      scope?: unknown;
      type?: unknown;
      onlyUncategorized?: unknown;
      useProvider?: unknown;
    };

    const scope = String(body.scope ?? "selected");
    const onlyUncategorized = body.onlyUncategorized !== false;
    const typeFilter = parseType(body.type);
    const useProvider = body.useProvider !== false;

    let where: Prisma.StreamWhereInput = { isActive: false };
    if (typeFilter) where.type = typeFilter;

    if (scope === "all_inactive_uncategorized") {
      if (onlyUncategorized) where.categoryId = null;
    } else {
      const ids = Array.isArray(body.streamIds)
        ? body.streamIds.map(String).filter(Boolean).slice(0, 500)
        : [];
      if (!ids.length) {
        return NextResponse.json({ error: "streamIds required" }, { status: 400 });
      }
      where = { id: { in: ids } };
      if (onlyUncategorized) where.categoryId = null;
    }

    const streams = await prisma.stream.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        streamUrl: true,
        providerId: true,
        providerPath: true,
        categoryId: true,
      },
      take: scope === "all_inactive_uncategorized" ? 2000 : 500,
    });

    const { updated, skipped } = await autoAssignCategories(streams, { useProvider });

    if (updated > 0) await invalidateXtreamCategories().catch(() => undefined);

    void logActivity("streams_auto_category", {
      userId: session.id,
      entity: "stream",
      meta: { scope, updated, skipped, type: typeFilter, useProvider },
    });

    return NextResponse.json({ ok: true, updated, skipped });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
