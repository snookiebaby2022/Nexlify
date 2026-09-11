import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  getResellerDashboardWidgets,
  getResellerDashboardWidgetsLight,
} from "@/lib/dashboard-widgets";
import { cacheGetOrSet } from "@/lib/cache";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const light = req.nextUrl.searchParams.get("light") === "1";
  if (light) {
    const data = await cacheGetOrSet(
      `dashboard:reseller-widgets-light:${session.id}`,
      60,
      () => getResellerDashboardWidgetsLight(session.id),
    );
    return NextResponse.json(data);
  }

  const data = await cacheGetOrSet(
    `dashboard:reseller-widgets:${session.id}`,
    120,
    () => getResellerDashboardWidgets(session.id),
  );
  return NextResponse.json(data);
}
