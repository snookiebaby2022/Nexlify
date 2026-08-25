import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { loadTmdbVodBackfillStatus } from "@/lib/vod-tmdb-backfill";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = await loadTmdbVodBackfillStatus();
  return NextResponse.json(status);
}
