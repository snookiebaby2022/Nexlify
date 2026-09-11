import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  getAdminDashboardWidgets,
  getAdminDashboardWidgetsLight,
} from "@/lib/dashboard-widgets";
import { cacheGetOrSet } from "@/lib/cache";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const light = req.nextUrl.searchParams.get("light") === "1";
  if (light) {
    const data = await cacheGetOrSet("dashboard:admin-widgets-light", 60, () =>
      getAdminDashboardWidgetsLight(),
    );
    return NextResponse.json(data);
  }

  const data = await cacheGetOrSet("dashboard:admin-widgets", 120, () => getAdminDashboardWidgets());
  return NextResponse.json(data);
}
