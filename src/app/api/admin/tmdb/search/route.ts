import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { searchTmdb } from "@/lib/tmdb";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const type = req.nextUrl.searchParams.get("type") === "tv" ? "tv" : "movie";

  if (q.length < 2) {
    return NextResponse.json({ results: [], error: "Enter at least 2 characters" });
  }

  try {
    const results = await searchTmdb(q, type);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "TMDB search failed", results: [] },
      { status: 400 }
    );
  }
}
