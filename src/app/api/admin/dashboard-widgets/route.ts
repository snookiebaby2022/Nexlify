import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getAdminDashboardWidgets } from "@/lib/dashboard-widgets";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await getAdminDashboardWidgets();
  return NextResponse.json(data);
}
