import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getResellerDashboardWidgets } from "@/lib/dashboard-widgets";

export async function GET() {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await getResellerDashboardWidgets(session.id);
  return NextResponse.json(data);
}
