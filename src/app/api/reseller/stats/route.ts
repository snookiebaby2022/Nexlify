import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  loadResellerDashboardStats,
  loadResellerHeaderStats,
} from "@/lib/reseller-dashboard-stats";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const light = req.nextUrl.searchParams.get("light") === "1";
  if (light) {
    const stats = await loadResellerHeaderStats(session);
    return NextResponse.json(stats);
  }

  const stats = await loadResellerDashboardStats(session);
  return NextResponse.json(stats);
}
