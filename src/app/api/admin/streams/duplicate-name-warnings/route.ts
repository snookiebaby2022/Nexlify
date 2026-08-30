import { NextRequest, NextResponse } from "next/server";
import { PanelRole, StreamType } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { findDuplicateNameCollisions } from "@/lib/stream-duplicates";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const typeParam = req.nextUrl.searchParams.get("type")?.toUpperCase() ?? "LIVE";
  const type =
    typeParam === "MOVIE"
      ? StreamType.MOVIE
      : typeParam === "SERIES"
        ? StreamType.SERIES
        : StreamType.LIVE;

  const { cacheGetOrSet } = await import("@/lib/cache");
  const result = await cacheGetOrSet(`dup-names:${type}`, 15 * 60, () => findDuplicateNameCollisions(type));
  return NextResponse.json({
    type: typeParam,
    ...result,
    examples: result.collisions.slice(0, 8).map((c) => ({
      name: c.displayName,
      count: c.streamCount,
      categories: c.sharedCategories.slice(0, 3),
      bouquets: c.sharedBouquets.slice(0, 3),
    })),
  });
}
