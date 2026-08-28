import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { loadResellerDashboardStats } from "@/lib/reseller-dashboard-stats";

export async function GET() {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stats = await loadResellerDashboardStats(session);
  return NextResponse.json(stats);
}
