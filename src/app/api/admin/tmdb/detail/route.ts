import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchTmdbDetails } from "@/lib/tmdb-details";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = parseInt(req.nextUrl.searchParams.get("id") ?? "", 10);
  const type = req.nextUrl.searchParams.get("type") === "tv" ? "tv" : "movie";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const details = await fetchTmdbDetails(id, type);
    return NextResponse.json({ details });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "TMDB fetch failed" },
      { status: 400 }
    );
  }
}
