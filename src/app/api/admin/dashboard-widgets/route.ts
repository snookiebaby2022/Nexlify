import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getAdminDashboardWidgets } from "@/lib/dashboard-widgets";
import { cacheGetOrSet } from "@/lib/cache";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await cacheGetOrSet("dashboard:admin-widgets", 30, () => getAdminDashboardWidgets());
  return NextResponse.json(data);
}
