import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/lines";
import {
  deleteDuplicateStreams,
  findDuplicateGroups,
  purgeUkUsaUrlDuplicateLive,
  type DuplicateKind,
} from "@/lib/stream-duplicates";
import {
  invalidateDashboardStats,
  invalidatePlaybackUrls,
  invalidateXtreamCategories,
} from "@/lib/cache-invalidate";

import { apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseKind(value: string | null): DuplicateKind | null {
  if (value === "movies" || value === "series" || value === "live") return value;
  return null;
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const kind = parseKind(req.nextUrl.searchParams.get("kind"));
  if (!kind) {
    return NextResponse.json({ error: "kind must be movies, series, or live" }, { status: 400 });
  }

  const matchParam = req.nextUrl.searchParams.get("match");
  const match = matchParam === "all" ? "all" : matchParam === "url" ? "url" : undefined;
  const categoryId = req.nextUrl.searchParams.get("categoryId") ?? undefined;
  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);

  try {
    const result = await findDuplicateGroups(kind, {
      match,
      categoryId,
      categoryNameLike: category,
      limit,
      offset,
    });
    return NextResponse.json(result);
  } catch (e) {
    return apiMutationErrorResponse(e, { exposeMessage: true });
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { ids?: unknown; confirm?: unknown; purgeUkUsa?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: "confirm must be true" }, { status: 400 });
  }

  if (body.purgeUkUsa === true) {
    const result = await purgeUkUsaUrlDuplicateLive();
    await logActivity("remove_duplicates", {
      userId: session.id,
      entity: "stream",
      meta: { purgeUkUsa: true, ...result },
    });
    await invalidatePlaybackUrls();
    await invalidateXtreamCategories();
    await invalidateDashboardStats();
    return NextResponse.json({ ok: true, ...result });
  }

  const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : [];
  if (!ids.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  if (ids.length > 5000) {
    return NextResponse.json({ error: "Delete at most 5000 streams per request" }, { status: 400 });
  }

  const result = await deleteDuplicateStreams(ids);
  await logActivity("remove_duplicates", {
    userId: session.id,
    entity: "stream",
    meta: { deleted: result.deleted, skipped: result.skipped },
  });
  await invalidatePlaybackUrls();
  await invalidateXtreamCategories();
  await invalidateDashboardStats();
  return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return apiMutationErrorResponse(e, { exposeMessage: true });
  }
}
