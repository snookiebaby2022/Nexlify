import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { logActivity } from "@/lib/lines";
import { invalidateXtreamCategories, invalidateDashboardStats } from "@/lib/cache-invalidate";

/** One-click dashboard fix: activate all inactive streams (or by type). */
export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }

  const action = String(body.action ?? "enable_all_inactive");
  if (action !== "enable_all_inactive" && action !== "enable_by_type") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const type = body.type ? String(body.type).toUpperCase() : null;
  const allowedTypes = ["LIVE", "MOVIE", "SERIES"] as const;
  type StreamTypeFilter = (typeof allowedTypes)[number];
  const typed =
    action === "enable_by_type" && type && (allowedTypes as readonly string[]).includes(type)
      ? (type as StreamTypeFilter)
      : null;

  if (action === "enable_by_type" && !typed) {
    return NextResponse.json(
      { error: "type required for enable_by_type (LIVE|MOVIE|SERIES)" },
      { status: 400 }
    );
  }

  const where = typed
    ? { isActive: false as const, type: typed as "LIVE" | "MOVIE" | "SERIES" }
    : { isActive: false as const };

  const result = await prisma.stream.updateMany({
    where,
    data: { isActive: true },
  });

  await logActivity("fix_inactive_streams", {
    userId: session.id,
    entity: "stream",
    meta: { updated: result.count, type: typed ?? "ALL" },
  });
  await invalidateXtreamCategories().catch(() => {});
  await invalidateDashboardStats().catch(() => {});

  return NextResponse.json({ ok: true, updated: result.count });
}
